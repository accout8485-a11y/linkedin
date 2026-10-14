import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkedInClient } from "../client.ts";
import { postUrn, record, restliDate } from "../restli.ts";
import { safe } from "./util.ts";

const METRICS = ["IMPRESSION", "MEMBERS_REACHED", "REACTION", "COMMENT", "RESHARE"] as const;

export function registerInsightTools(server: McpServer, client: LinkedInClient): void {
  server.registerTool(
    "linkedin_my_post_analytics",
    {
      title: "My post analytics",
      description:
        "Creator analytics for your own posts: impressions, members reached, reactions, comments or reshares — for one post or across all your posts, as a total or daily series. Needs the r_member_postAnalytics scope (Community Management API).",
      inputSchema: {
        metric: z.enum(METRICS).default("IMPRESSION"),
        post: z.string().optional().describe("Post URN/URL. Omit for all of your posts."),
        aggregation: z.enum(["TOTAL", "DAILY"]).default("TOTAL"),
        start_date: z.string().optional().describe("YYYY-MM-DD"),
        end_date: z.string().optional().describe("YYYY-MM-DD"),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { metric: string; post?: string; aggregation: string; start_date?: string; end_date?: string }) => {
      if (a.aggregation === "DAILY" && !a.start_date) throw new Error("DAILY aggregation needs start_date.");
      const dateRange = a.start_date
        ? record({
            start: restliDate(a.start_date),
            ...(a.end_date ? { end: restliDate(a.end_date) } : {}),
          })
        : undefined;
      let entity;
      if (a.post) {
        const urn = postUrn(a.post);
        entity = record(urn.startsWith("urn:li:ugcPost:") ? { ugc: urn } : { share: urn });
      }
      return (
        await client.request({
          path: "/rest/memberCreatorPostAnalytics",
          query: {
            q: entity ? "entity" : "me",
            entity,
            queryType: a.metric,
            aggregation: a.aggregation,
            dateRange,
          },
        })
      ).data;
    }),
  );

  server.registerTool(
    "linkedin_my_follower_count",
    {
      title: "My follower count",
      description: "Your total LinkedIn follower count, or daily new followers within a date range. Needs r_member_profileAnalytics.",
      inputSchema: {
        start_date: z.string().optional().describe("YYYY-MM-DD; with end_date returns a daily series."),
        end_date: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { start_date?: string; end_date?: string }) =>
      (
        await client.request({
          path: "/rest/memberFollowersCount",
          query: a.start_date
            ? {
                q: "dateRange",
                dateRange: record({
                  start: restliDate(a.start_date),
                  ...(a.end_date ? { end: restliDate(a.end_date) } : {}),
                }),
              }
            : { q: "me" },
        })
      ).data,
    ),
  );
}
