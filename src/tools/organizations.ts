import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LinkedInClient } from "../client.ts";
import { list, organizationUrn, postUrn, raw, record, urnPath, type Raw } from "../restli.ts";
import { safe } from "./util.ts";

const orgSchema = z.string().describe("Organization URN (`urn:li:organization:123`) or numeric id.");

const rangeSchema = {
  start_date: z.string().optional().describe("YYYY-MM-DD. Omit both dates for lifetime totals."),
  end_date: z.string().optional().describe("YYYY-MM-DD (exclusive)."),
  granularity: z.enum(["DAY", "MONTH"]).default("DAY"),
};

function timeIntervals(a: { start_date?: string; end_date?: string; granularity: string }): Raw | undefined {
  if (!a.start_date) return undefined;
  const start = Date.parse(`${a.start_date}T00:00:00Z`);
  const end = a.end_date ? Date.parse(`${a.end_date}T00:00:00Z`) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error("Dates must be YYYY-MM-DD.");
  return record({ timeRange: record({ start, end }), timeGranularityType: raw(a.granularity) });
}

export function registerOrganizationTools(server: McpServer, client: LinkedInClient): void {
  server.registerTool(
    "linkedin_list_my_organizations",
    {
      title: "List organizations I manage",
      description:
        "Lists LinkedIn Pages where you have an approved role (default ADMINISTRATOR). Needs Community Management API access.",
      inputSchema: {
        role: z
          .enum(["ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER", "RECRUITING_POSTER", "LEAD_GEN_FORMS_MANAGER", "ANALYST", "CONTENT_ADMINISTRATOR", "CURATOR"])
          .default("ADMINISTRATOR"),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ role }: { role: string }) =>
      (
        await client.request({
          path: "/rest/organizationAcls",
          query: { q: "roleAssignee", role, state: "APPROVED" },
        })
      ).data,
    ),
  );

  server.registerTool(
    "linkedin_get_organization",
    {
      title: "Get an organization",
      description: "Looks up a LinkedIn Page by id/URN or by vanity name (the part after linkedin.com/company/).",
      inputSchema: {
        organization: orgSchema.optional(),
        vanity_name: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { organization?: string; vanity_name?: string }) => {
      if (a.vanity_name) {
        return (await client.request({ path: "/rest/organizations", query: { q: "vanityName", vanityName: a.vanity_name } })).data;
      }
      if (!a.organization) throw new Error("Pass organization or vanity_name.");
      const id = organizationUrn(a.organization).split(":").pop();
      return (await client.request({ path: `/rest/organizations/${id}` })).data;
    }),
  );

  server.registerTool(
    "linkedin_org_follower_count",
    {
      title: "Organization follower count",
      description: "Returns the total number of followers of a LinkedIn Page.",
      inputSchema: { organization: orgSchema },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ organization }: { organization: string }) =>
      (
        await client.request({
          path: `/rest/networkSizes/${urnPath(organizationUrn(organization))}`,
          query: { edgeType: "COMPANY_FOLLOWED_BY_MEMBER" },
        })
      ).data,
    ),
  );

  server.registerTool(
    "linkedin_org_follower_stats",
    {
      title: "Organization follower insights",
      description:
        "Follower demographics (by seniority, industry, function, region, company size) or, with a date range, follower gains over time.",
      inputSchema: { organization: orgSchema, ...rangeSchema },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { organization: string; start_date?: string; end_date?: string; granularity: string }) =>
      (
        await client.request({
          path: "/rest/organizationalEntityFollowerStatistics",
          query: {
            q: "organizationalEntity",
            organizationalEntity: organizationUrn(a.organization),
            timeIntervals: timeIntervals(a),
          },
        })
      ).data,
    ),
  );

  server.registerTool(
    "linkedin_org_share_stats",
    {
      title: "Organization post insights",
      description:
        "Impressions, unique impressions, clicks, likes, comments, shares and engagement rate for a Page — overall, over time, or for specific posts.",
      inputSchema: {
        organization: orgSchema,
        posts: z.array(z.string()).max(20).optional().describe("Limit to these post URNs/URLs."),
        ...rangeSchema,
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { organization: string; posts?: string[]; start_date?: string; end_date?: string; granularity: string }) => {
      const urns = (a.posts ?? []).map(postUrn);
      const shares = urns.filter((u) => u.startsWith("urn:li:share:"));
      const ugcPosts = urns.filter((u) => u.startsWith("urn:li:ugcPost:"));
      return (
        await client.request({
          path: "/rest/organizationalEntityShareStatistics",
          query: {
            q: "organizationalEntity",
            organizationalEntity: organizationUrn(a.organization),
            timeIntervals: timeIntervals(a),
            shares: shares.length ? list(shares) : undefined,
            ugcPosts: ugcPosts.length ? list(ugcPosts) : undefined,
          },
        })
      ).data;
    }),
  );

  server.registerTool(
    "linkedin_org_page_stats",
    {
      title: "Organization page view insights",
      description: "Page views and unique visitors for a LinkedIn Page, broken down by page section, device and visitor demographics.",
      inputSchema: { organization: orgSchema, ...rangeSchema },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { organization: string; start_date?: string; end_date?: string; granularity: string }) =>
      (
        await client.request({
          path: "/rest/organizationPageStatistics",
          query: {
            q: "organization",
            organization: organizationUrn(a.organization),
            timeIntervals: timeIntervals(a),
          },
        })
      ).data,
    ),
  );
}
