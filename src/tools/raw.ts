import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkedInClient } from "../client.ts";
import { raw } from "../restli.ts";
import { safe } from "./util.ts";

export function registerRawTool(server: McpServer, client: LinkedInClient): void {
  server.registerTool(
    "linkedin_api_request",
    {
      title: "Call any LinkedIn API endpoint",
      description:
        "Escape hatch for LinkedIn REST endpoints the other tools don't cover (e.g. events, documents, videos, ads, lead-gen). Auth, LinkedIn-Version and Rest.li headers are added automatically. Query values are sent as given, so Rest.li values such as List(...) or URNs must already be URL-encoded (`:` as %3A). Writes are real: confirm with the user before any non-GET call.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
        path: z.string().describe("Path on api.linkedin.com starting with /rest/ or /v2/."),
        query: z.record(z.string(), z.string()).optional(),
        body: z.unknown().optional(),
        restli_method: z
          .string()
          .optional()
          .describe("Sets X-RestLi-Method, e.g. FINDER, PARTIAL_UPDATE, BATCH_GET."),
      },
      annotations: { openWorldHint: true },
    },
    safe(async (a: { method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"; path: string; query?: Record<string, string>; body?: unknown; restli_method?: string }) => {
      const res = await client.request({
        method: a.method,
        path: a.path,
        query: a.query && Object.fromEntries(Object.entries(a.query).map(([k, v]) => [k, raw(v)])),
        body: a.body,
        headers: a.restli_method ? { "X-RestLi-Method": a.restli_method } : undefined,
      });
      return { status: res.status, id: res.id, data: res.data };
    }),
  );
}
