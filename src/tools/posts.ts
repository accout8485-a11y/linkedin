import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkedInClient } from "../client.ts";
import { organizationUrn, postUrn, urnPath } from "../restli.ts";
import { safe, toLittleText } from "./util.ts";

const authorSchema = z
  .string()
  .optional()
  .describe(
    "Post as an organization (`urn:li:organization:123` or `123`). Omit to post as yourself. Requires Community Management access.",
  );

export function registerPostTools(server: McpServer, client: LinkedInClient): void {
  const resolveAuthor = async (author?: string) =>
    author ? organizationUrn(author) : client.memberUrn();

  server.registerTool(
    "linkedin_create_post",
    {
      title: "Publish a LinkedIn post",
      description:
        "Publishes a post to LinkedIn, optionally with a link preview or images. This is public and immediate: show the user the final text and get explicit confirmation before calling. `#hashtags` in the text are turned into real hashtags.",
      inputSchema: {
        text: z.string().min(1).max(3000).describe("Post body."),
        visibility: z.enum(["PUBLIC", "CONNECTIONS", "LOGGED_IN"]).default("PUBLIC"),
        author: authorSchema,
        article_url: z.string().url().optional().describe("Attach a link preview."),
        article_title: z.string().optional(),
        article_description: z.string().optional(),
        image_paths: z.array(z.string()).max(20).optional().describe("Local image files to attach."),
        image_alt_texts: z.array(z.string()).optional(),
        raw_commentary: z
          .boolean()
          .default(false)
          .describe("Send text as-is (already in LinkedIn little-text format, e.g. with @mentions)."),
        draft: z.boolean().default(false).describe("Save as a draft instead of publishing."),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    safe(async (a: {
      text: string;
      visibility: string;
      author?: string;
      article_url?: string;
      article_title?: string;
      article_description?: string;
      image_paths?: string[];
      image_alt_texts?: string[];
      raw_commentary: boolean;
      draft: boolean;
    }) => {
      const author = await resolveAuthor(a.author);
      let content: Record<string, unknown> | undefined;
      if (a.image_paths?.length) {
        if (a.article_url) throw new Error("A post can have either images or a link, not both.");
        const images = [];
        for (const [i, path] of a.image_paths.entries()) {
          images.push({ id: await client.uploadImage(author, path), altText: a.image_alt_texts?.[i] ?? "" });
        }
        content = images.length === 1 ? { media: images[0] } : { multiImage: { images } };
      } else if (a.article_url) {
        content = {
          article: {
            source: a.article_url,
            ...(a.article_title ? { title: a.article_title } : {}),
            ...(a.article_description ? { description: a.article_description } : {}),
          },
        };
      }
      const res = await client.request({
        method: "POST",
        path: "/rest/posts",
        body: {
          author,
          commentary: a.raw_commentary ? a.text : toLittleText(a.text),
          visibility: a.visibility,
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          ...(content ? { content } : {}),
          lifecycleState: a.draft ? "DRAFT" : "PUBLISHED",
          isReshareDisabledByAuthor: false,
        },
      });
      return { post_urn: res.id, url: res.id ? `https://www.linkedin.com/feed/update/${res.id}/` : undefined };
    }),
  );

  server.registerTool(
    "linkedin_reshare_post",
    {
      title: "Reshare a LinkedIn post",
      description: "Reshares an existing post with your own commentary. Confirm with the user first.",
      inputSchema: {
        post: z.string().describe("Post URN or linkedin.com post URL to reshare."),
        text: z.string().max(3000).default(""),
        visibility: z.enum(["PUBLIC", "CONNECTIONS", "LOGGED_IN"]).default("PUBLIC"),
        author: authorSchema,
      },
      annotations: { openWorldHint: true },
    },
    safe(async (a: { post: string; text: string; visibility: string; author?: string }) => {
      const res = await client.request({
        method: "POST",
        path: "/rest/posts",
        body: {
          author: await resolveAuthor(a.author),
          commentary: toLittleText(a.text),
          visibility: a.visibility,
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
          reshareContext: { parent: postUrn(a.post) },
        },
      });
      return { post_urn: res.id };
    }),
  );

  server.registerTool(
    "linkedin_get_post",
    {
      title: "Get a LinkedIn post",
      description: "Fetches a post by URN or URL. Reading posts you did not author needs r_member_social or organization scopes.",
      inputSchema: { post: z.string().describe("Post URN (urn:li:share:… / urn:li:ugcPost:…) or URL.") },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ post }: { post: string }) =>
      (await client.request({ path: `/rest/posts/${urnPath(postUrn(post))}`, query: { viewContext: "AUTHOR" } })).data,
    ),
  );

  server.registerTool(
    "linkedin_list_posts",
    {
      title: "List posts by an author",
      description:
        "Lists posts authored by you or by an organization you admin, newest first. Listing your own member posts needs the restricted r_member_social scope; organization posts need r_organization_social.",
      inputSchema: {
        author: authorSchema,
        count: z.number().int().min(1).max(100).default(10),
        start: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { author?: string; count: number; start: number }) =>
      (
        await client.request({
          path: "/rest/posts",
          headers: { "X-RestLi-Method": "FINDER" },
          query: {
            q: "author",
            author: await resolveAuthor(a.author),
            count: a.count,
            start: a.start,
            sortBy: "LAST_MODIFIED",
          },
        })
      ).data,
    ),
  );

  server.registerTool(
    "linkedin_update_post",
    {
      title: "Edit a LinkedIn post",
      description: "Replaces the text of a post you authored. Confirm the new text with the user first.",
      inputSchema: {
        post: z.string(),
        text: z.string().min(1).max(3000),
        raw_commentary: z.boolean().default(false),
      },
      annotations: { idempotentHint: true, openWorldHint: true },
    },
    safe(async (a: { post: string; text: string; raw_commentary: boolean }) => {
      const urn = postUrn(a.post);
      await client.request({
        method: "POST",
        path: `/rest/posts/${urnPath(urn)}`,
        headers: { "X-RestLi-Method": "PARTIAL_UPDATE" },
        body: { patch: { $set: { commentary: a.raw_commentary ? a.text : toLittleText(a.text) } } },
      });
      return { updated: urn };
    }),
  );

  server.registerTool(
    "linkedin_delete_post",
    {
      title: "Delete a LinkedIn post",
      description: "Permanently deletes a post you authored. Cannot be undone; confirm with the user first.",
      inputSchema: { post: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe(async ({ post }: { post: string }) => {
      const urn = postUrn(post);
      await client.request({ method: "DELETE", path: `/rest/posts/${urnPath(urn)}` });
      return { deleted: urn };
    }),
  );
}
