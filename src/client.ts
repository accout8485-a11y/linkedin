import { readFile } from "node:fs/promises";
import { API_BASE, type Config } from "./config.ts";
import type { TokenStore } from "./auth.ts";
import { buildQuery, type QueryValue } from "./restli.ts";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Path starting with `/rest/` or `/v2/`. */
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  /** Value of `x-restli-id` / `x-linkedin-id`, set on creates. */
  id?: string;
  data: T;
}

export class LinkedInApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly path: string;
  constructor(status: number, body: unknown, path: string) {
    super(LinkedInApiError.describe(status, body, path));
    this.status = status;
    this.body = body;
    this.path = path;
  }

  static describe(status: number, body: unknown, path: string): string {
    const msg =
      typeof body === "object" && body && "message" in body ? String(body.message) : JSON.stringify(body);
    const hint =
      status === 401
        ? " (token missing or expired; run linkedin_login)"
        : status === 403
          ? " (your LinkedIn app lacks the product/scope for this endpoint; see README > Access levels)"
          : status === 426
            ? " (LinkedIn-Version not supported; set LINKEDIN_API_VERSION)"
            : "";
    return `LinkedIn API ${status} on ${path}: ${msg}${hint}`;
  }
}

export class LinkedInClient {
  readonly config: Config;
  readonly tokens: TokenStore;
  private memberUrnCache?: string;

  constructor(config: Config, tokens: TokenStore) {
    this.config = config;
    this.tokens = tokens;
  }

  async request<T = unknown>(opts: RequestOptions): Promise<ApiResponse<T>> {
    if (!opts.path.startsWith("/rest/") && !opts.path.startsWith("/v2/")) {
      throw new Error("Path must start with /rest/ or /v2/.");
    }
    const token = await this.tokens.accessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      ...(opts.path.startsWith("/rest/") ? { "LinkedIn-Version": this.config.apiVersion } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    };
    const url = `${API_BASE}${opts.path}${buildQuery(opts.query)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
      throw new Error(`Could not reach ${API_BASE}${cause}`);
    }
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body; keep the text.
    }
    if (!res.ok) throw new LinkedInApiError(res.status, data, opts.path);
    const id = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id") ?? undefined;
    return { status: res.status, id, data: data as T };
  }

  /** OpenID Connect userinfo: sub, name, email, picture, locale. */
  async userinfo(): Promise<Record<string, unknown>> {
    return (await this.request<Record<string, unknown>>({ path: "/v2/userinfo" })).data;
  }

  /** `urn:li:person:{sub}` for the authenticated member. */
  async memberUrn(): Promise<string> {
    if (!this.memberUrnCache) {
      const info = await this.userinfo();
      this.memberUrnCache = `urn:li:person:${String(info.sub)}`;
    }
    return this.memberUrnCache;
  }

  /** Uploads a local image and returns its `urn:li:image:...`. */
  async uploadImage(owner: string, filePath: string): Promise<string> {
    const init = await this.request<{ value: { uploadUrl: string; image: string } }>({
      method: "POST",
      path: "/rest/images",
      query: { action: "initializeUpload" },
      body: { initializeUploadRequest: { owner } },
    });
    const bytes = await readFile(filePath);
    const token = await this.tokens.accessToken();
    const res = await fetch(init.data.value.uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: bytes,
    });
    if (!res.ok) throw new Error(`Image upload failed with ${res.status}: ${await res.text()}`);
    return init.data.value.image;
  }
}
