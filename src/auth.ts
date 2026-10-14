import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname } from "node:path";
import { AUTH_BASE, type Config } from "./config.ts";

export interface StoredToken {
  access_token: string;
  /** Epoch ms. */
  expires_at?: number;
  refresh_token?: string;
  refresh_expires_at?: number;
  scope?: string;
  obtained_at: number;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export function buildAuthUrl(config: Config, state: string): string {
  if (!config.clientId) throw new Error("LINKEDIN_CLIENT_ID is not set.");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: config.scopes.join(" "),
  });
  return `${AUTH_BASE}/authorization?${params}`;
}

function toStored(res: TokenResponse, previous?: StoredToken): StoredToken {
  const now = Date.now();
  return {
    access_token: res.access_token,
    expires_at: res.expires_in ? now + res.expires_in * 1000 : undefined,
    refresh_token: res.refresh_token ?? previous?.refresh_token,
    refresh_expires_at: res.refresh_token_expires_in
      ? now + res.refresh_token_expires_in * 1000
      : previous?.refresh_expires_at,
    scope: res.scope ?? previous?.scope,
    obtained_at: now,
  };
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LinkedIn token endpoint returned ${res.status}: ${text}`);
  return JSON.parse(text) as TokenResponse;
}

function requireClient(config: Config): { clientId: string; clientSecret: string } {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must both be set.");
  }
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

export async function exchangeCode(config: Config, code: string): Promise<StoredToken> {
  const { clientId, clientSecret } = requireClient(config);
  const res = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  return toStored(res);
}

export async function refreshToken(config: Config, token: StoredToken): Promise<StoredToken> {
  const { clientId, clientSecret } = requireClient(config);
  if (!token.refresh_token) throw new Error("No refresh token available.");
  const res = await postToken({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });
  return toStored(res, token);
}

export class TokenStore {
  private readonly config: Config;
  private cached?: StoredToken;
  constructor(config: Config) {
    this.config = config;
  }

  async load(): Promise<StoredToken | undefined> {
    if (this.config.envAccessToken) {
      return { access_token: this.config.envAccessToken, obtained_at: 0 };
    }
    if (this.cached) return this.cached;
    try {
      this.cached = JSON.parse(await readFile(this.config.tokenPath, "utf8")) as StoredToken;
      return this.cached;
    } catch {
      return undefined;
    }
  }

  async save(token: StoredToken): Promise<void> {
    await mkdir(dirname(this.config.tokenPath), { recursive: true, mode: 0o700 });
    await writeFile(this.config.tokenPath, JSON.stringify(token, null, 2), { mode: 0o600 });
    await chmod(this.config.tokenPath, 0o600);
    this.cached = token;
  }

  async clear(): Promise<void> {
    this.cached = undefined;
    await rm(this.config.tokenPath, { force: true });
  }

  /** Returns a usable access token, refreshing it when possible. */
  async accessToken(): Promise<string> {
    let token = await this.load();
    if (!token) {
      throw new Error(
        "Not authenticated with LinkedIn. Run the linkedin_login tool (or `node dist/server.js auth`), or set LINKEDIN_ACCESS_TOKEN.",
      );
    }
    const expiringSoon = token.expires_at !== undefined && token.expires_at - Date.now() < 60_000;
    if (expiringSoon && !this.config.envAccessToken) {
      if (!token.refresh_token) {
        throw new Error("LinkedIn access token has expired. Run linkedin_login again.");
      }
      token = await refreshToken(this.config, token);
      await this.save(token);
    }
    return token.access_token;
  }
}

export interface PendingLogin {
  url: string;
  /** Resolves once the browser hits the callback and the token is saved. */
  done: Promise<StoredToken>;
  close: () => void;
}

/**
 * Starts a one-shot local HTTP server on the redirect URI's port, waits for
 * LinkedIn to redirect back with an authorization code, exchanges it and
 * saves the token.
 */
export function startLogin(config: Config, store: TokenStore, timeoutMs = 10 * 60_000): PendingLogin {
  requireClient(config);
  const redirect = new URL(config.redirectUri);
  if (!["localhost", "127.0.0.1"].includes(redirect.hostname)) {
    throw new Error(
      `Automatic login needs a localhost redirect URI (got ${config.redirectUri}). Use linkedin_exchange_code instead.`,
    );
  }
  const state = randomBytes(16).toString("hex");
  const url = buildAuthUrl(config, state);
  let server: Server | undefined;
  let timer: NodeJS.Timeout | undefined;

  const done = new Promise<StoredToken>((resolve, reject) => {
    server = createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? "/", config.redirectUri);
      if (reqUrl.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      const finish = (status: number, message: string) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><title>LinkedIn MCP</title><p>${message}</p>`);
      };
      const error = reqUrl.searchParams.get("error");
      if (error) {
        finish(400, `LinkedIn returned an error: ${error}. You can close this tab.`);
        reject(new Error(`${error}: ${reqUrl.searchParams.get("error_description") ?? ""}`));
        return;
      }
      if (reqUrl.searchParams.get("state") !== state) {
        finish(400, "State mismatch; ignoring this request.");
        return;
      }
      try {
        const token = await exchangeCode(config, reqUrl.searchParams.get("code") ?? "");
        await store.save(token);
        finish(200, "LinkedIn connected. You can close this tab and return to Claude.");
        resolve(token);
      } catch (err) {
        finish(500, "Token exchange failed; see Claude for details.");
        reject(err);
      }
    });
    server.on("error", reject);
    server.listen(Number(redirect.port || 80), redirect.hostname);
    timer = setTimeout(() => reject(new Error("Timed out waiting for LinkedIn login.")), timeoutMs);
  });

  const close = () => {
    clearTimeout(timer);
    server?.close();
  };
  done.then(close, close);
  return { url, done, close };
}

/** Extracts `code` from either a raw code or a full redirected URL. */
export function parseCode(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//.test(trimmed)) {
    const code = new URL(trimmed).searchParams.get("code");
    if (!code) throw new Error("That URL has no `code` parameter.");
    return code;
  }
  return trimmed;
}
