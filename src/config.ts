import { homedir } from "node:os";
import { join } from "node:path";

export const API_BASE = "https://api.linkedin.com";
export const AUTH_BASE = "https://www.linkedin.com/oauth/v2";

/** Scopes requested by default. The first four come with the self-serve
 * "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn"
 * products; add more (e.g. Community Management scopes) via LINKEDIN_SCOPES. */
export const DEFAULT_SCOPES = ["openid", "profile", "email", "w_member_social"];

export interface Config {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
  apiVersion: string;
  tokenPath: string;
  envAccessToken?: string;
}

/**
 * LinkedIn's versioned REST API needs a `LinkedIn-Version: YYYYMM` header and
 * each version is supported for roughly a year. Default to the version from
 * two months ago so the plugin keeps working without code changes.
 */
export function defaultApiVersion(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const scopes = env.LINKEDIN_SCOPES
    ? env.LINKEDIN_SCOPES.split(/[\s,]+/).filter(Boolean)
    : DEFAULT_SCOPES;
  return {
    clientId: env.LINKEDIN_CLIENT_ID || undefined,
    clientSecret: env.LINKEDIN_CLIENT_SECRET || undefined,
    redirectUri: env.LINKEDIN_REDIRECT_URI || "http://localhost:8765/callback",
    scopes,
    apiVersion: env.LINKEDIN_API_VERSION || defaultApiVersion(),
    tokenPath:
      env.LINKEDIN_TOKEN_PATH || join(homedir(), ".config", "linkedin-mcp", "token.json"),
    envAccessToken: env.LINKEDIN_ACCESS_TOKEN || undefined,
  };
}
