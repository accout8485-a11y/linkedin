import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkedInClient } from "../client.ts";
import { organizationUrn, postUrn, record, urnPath } from "../restli.ts";
import { safe } from "./util.ts";

const REACTIONS = ["LIKE", "PRAISE", "EMPATHY", "INTEREST", "APPRECIATION", "ENTERTAINMENT"] as const;

const actorSchema = z
  .string()
  .optional()
  .describe("Act as an organization you admin (`urn:li:organization:123`). Omit to act as yourself.");

/** Accepts `123` or `urn:li:comment:(urn:li:activity:1,123)` and returns `123`. */
function commentId(input: string): string {
  const m = input.match(/(\d+)\)?$/);
  if (!m) throw new Error(`Could not read a comment id from "${input}".`);
  return m[1];
}

export function registerEngagementTools(server: McpServer, client: LinkedInClient): void {
  const actor = async (a?: string) => (a ? organizationUrn(a) : client.memberUrn());

  server.registerTool(
    "linkedin_comment",
    {
      title: "Comment on a LinkedIn post",
      description: "Adds a comment (or a reply to a comment) on a post. Public; confirm the text with the user first.",
      inputSchema: {
        post: z.string().describe("Post URN or URL."),
        text: z.string().min(1).max(1250),
        parent_comment: z.string().optional().describe("Comment URN to reply to."),
        actor: actorSchema,
      },
      annotations: { openWorldHint: true },
    },
    safe(async (a: { post: string; text: string; parent_comment?: string; actor?: string }) => {
      const urn = postUrn(a.post);
      const res = await client.request({
        method: "POST",
        path: `/rest/socialActions/${urnPath(urn)}/comments`,
        body: {
          actor: await actor(a.actor),
          object: urn,
          message: { text: a.text },
          ...(a.parent_comment ? { parentComment: a.parent_comment } : {}),
        },
      });
      return { comment: res.id ?? res.data };
    }),
  );

  server.registerTool(
    "linkedin_list_comments",
    {
      title: "List comments on a post",
      description: "Lists comments on a post, for reading discussion or finding comments to reply to.",
      inputSchema: {
        post: z.string(),
        count: z.number().int().min(1).max(100).default(20),
        start: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { post: string; count: number; start: number }) =>
      (
        await client.request({
          path: `/rest/socialActions/${urnPath(postUrn(a.post))}/comments`,
          query: { count: a.count, start: a.start },
        })
      ).data,
    ),
  );

  server.registerTool(
    "linkedin_delete_comment",
    {
      title: "Delete a comment",
      description: "Deletes a comment you (or your organization) wrote. Confirm with the user first.",
      inputSchema: { post: z.string(), comment: z.string().describe("Comment id or URN."), actor: actorSchema },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    safe(async (a: { post: string; comment: string; actor?: string }) => {
      await client.request({
        method: "DELETE",
        path: `/rest/socialActions/${urnPath(postUrn(a.post))}/comments/${commentId(a.comment)}`,
        query: { actor: await actor(a.actor) },
      });
      return { deleted: a.comment };
    }),
  );

  server.registerTool(
    "linkedin_react",
    {
      title: "React to a post",
      description: "Adds a reaction (like, celebrate, etc.) to a post or comment.",
      inputSchema: {
        target: z.string().describe("Post URN/URL or comment URN."),
        reaction: z
          .enum(REACTIONS)
          .default("LIKE")
          .describe("LIKE, PRAISE (celebrate), EMPATHY (love), INTEREST (insightful), APPRECIATION (support), ENTERTAINMENT (funny)."),
        actor: actorSchema,
      },
      annotations: { idempotentHint: true, openWorldHint: true },
    },
    safe(async (a: { target: string; reaction: string; actor?: string }) => {
      const root = a.target.startsWith("urn:li:comment:") ? a.target : postUrn(a.target);
      await client.request({
        method: "POST",
        path: "/rest/reactions",
        query: { actor: await actor(a.actor) },
        body: { root, reactionType: a.reaction },
      });
      return { reacted: a.reaction, to: root };
    }),
  );

  server.registerTool(
    "linkedin_remove_reaction",
    {
      title: "Remove a reaction",
      description: "Removes your reaction from a post or comment.",
      inputSchema: { target: z.string(), actor: actorSchema },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe(async (a: { target: string; actor?: string }) => {
      const entity = a.target.startsWith("urn:li:comment:") ? a.target : postUrn(a.target);
      const key = record({ actor: await actor(a.actor), entity });
      await client.request({ method: "DELETE", path: `/rest/reactions/${key.value}` });
      return { removed: entity };
    }),
  );

  server.registerTool(
    "linkedin_list_reactions",
    {
      title: "List reactions on a post",
      description: "Lists who reacted to a post and how.",
      inputSchema: { target: z.string(), count: z.number().int().min(1).max(100).default(20) },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { target: string; count: number }) => {
      const entity = a.target.startsWith("urn:li:comment:") ? a.target : postUrn(a.target);
      return (
        await client.request({
          path: `/rest/reactions/${record({ entity }).value}`,
          query: { q: "entity", count: a.count, sort: "REVERSE_CHRONOLOGICAL" },
        })
      ).data;
    }),
  );

  server.registerTool(
    "linkedin_get_social_metadata",
    {
      title: "Post engagement counts",
      description: "Returns reaction counts by type and comment count for a post — a quick engagement summary.",
      inputSchema: { post: z.string() },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ post }: { post: string }) =>
      (await client.request({ path: `/rest/socialMetadata/${urnPath(postUrn(post))}` })).data,
    ),
  );
}
