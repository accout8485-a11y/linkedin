import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startLogin, TokenStore } from "./auth.ts";
import { LinkedInClient } from "./client.ts";
import { loadConfig } from "./config.ts";
import { registerAccountTools } from "./tools/account.ts";
import { registerEngagementTools } from "./tools/engagement.ts";
import { registerInsightTools } from "./tools/insights.ts";
import { registerJobTools } from "./tools/jobs.ts";
import { registerOrganizationTools } from "./tools/organizations.ts";
import { registerPostTools } from "./tools/posts.ts";
import { registerRawTool } from "./tools/raw.ts";

export const VERSION = "0.1.0";

export function createServer(client: LinkedInClient): McpServer {
  const server = new McpServer({ name: "linkedin", version: VERSION });
  registerAccountTools(server, client);
  registerPostTools(server, client);
  registerEngagementTools(server, client);
  registerOrganizationTools(server, client);
  registerInsightTools(server, client);
  registerJobTools(server);
  registerRawTool(server, client);
  return server;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const tokens = new TokenStore(config);

  if (process.argv[2] === "auth") {
    const login = startLogin(config, tokens);
    console.log(`Open this URL to connect LinkedIn:\n\n${login.url}\n\nWaiting for the redirect to ${config.redirectUri} ...`);
    const token = await login.done;
    console.log(`Connected. Token saved to ${config.tokenPath} (scopes: ${token.scope ?? "unknown"}).`);
    return;
  }

  const server = createServer(new LinkedInClient(config, tokens));
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
