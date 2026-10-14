import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exchangeCode, parseCode, startLogin, buildAuthUrl, type PendingLogin } from "../auth.ts";
import type { LinkedInClient } from "../client.ts";
import { safe } from "./util.ts";

export function registerAccountTools(server: McpServer, client: LinkedInClient): void {
  const { config, tokens } = client;
  let pending: PendingLogin | undefined;

  server.registerTool(
    "linkedin_login",
    {
      title: "Connect LinkedIn account",
      description:
        "Starts the LinkedIn OAuth login. Returns a URL the user must open in a browser; the token is saved automatically when LinkedIn redirects back to the local callback. Give the URL to the user and then call linkedin_auth_status to confirm.",
      inputSchema: {},
    },
    safe(async () => {
      pending?.close();
      pending = startLogin(config, tokens);
      pending.done.catch(() => {});
      return {
        open_this_url: pending.url,
        redirect_uri: config.redirectUri,
        scopes: config.scopes,
        note: "If the browser is on a different machine than this server, the redirect will fail; copy the final URL from the address bar and pass it to linkedin_exchange_code.",
      };
    }),
  );

  server.registerTool(
    "linkedin_exchange_code",
    {
      title: "Finish LinkedIn login manually",
      description:
        "Completes login using the authorization code, or the full redirected URL containing ?code=..., when the automatic callback could not be reached.",
      inputSchema: { code_or_url: z.string().describe("The `code` value or the full redirect URL.") },
    },
    safe(async ({ code_or_url }: { code_or_url: string }) => {
      const token = await exchangeCode(config, parseCode(code_or_url));
      await tokens.save(token);
      pending?.close();
      return { connected: true, scope: token.scope, expires_at: token.expires_at && new Date(token.expires_at).toISOString() };
    }),
  );

  server.registerTool(
    "linkedin_auth_status",
    {
      title: "LinkedIn connection status",
      description: "Shows whether a LinkedIn token is available, its scopes and expiry, and the configured API version.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const token = await tokens.load();
      return {
        authenticated: Boolean(token),
        source: config.envAccessToken ? "LINKEDIN_ACCESS_TOKEN" : token ? config.tokenPath : null,
        scope: token?.scope,
        expires_at: token?.expires_at && new Date(token.expires_at).toISOString(),
        has_refresh_token: Boolean(token?.refresh_token),
        client_configured: Boolean(config.clientId && config.clientSecret),
        requested_scopes: config.scopes,
        api_version: config.apiVersion,
        auth_url_preview: config.clientId ? buildAuthUrl(config, "preview") : undefined,
      };
    }),
  );

  server.registerTool(
    "linkedin_logout",
    {
      title: "Disconnect LinkedIn",
      description: "Deletes the locally stored LinkedIn token.",
      inputSchema: {},
      annotations: { destructiveHint: true },
    },
    safe(async () => {
      await tokens.clear();
      return { logged_out: true };
    }),
  );

  server.registerTool(
    "linkedin_get_profile",
    {
      title: "Get my LinkedIn profile",
      description:
        "Returns the authenticated member's basic profile (name, email, picture, locale) and their person URN, used as the author/actor in other tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const info = await client.userinfo();
      return { person_urn: `urn:li:person:${String(info.sub)}`, ...info };
    }),
  );
}
