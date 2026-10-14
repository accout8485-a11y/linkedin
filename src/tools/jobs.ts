import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildJobSearchUrl, EXPERIENCE, JOB_TYPE, POSTED_WITHIN, WORKPLACE, type JobSearch } from "../jobs.ts";
import { safe } from "./util.ts";

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export function registerJobTools(server: McpServer): void {
  server.registerTool(
    "linkedin_job_search_link",
    {
      title: "Build a LinkedIn job search",
      description:
        "Builds a filtered linkedin.com job search link for the user to open. LinkedIn does not offer a public jobs search API, so this tool cannot list or apply to jobs itself; turn the user's criteria into filters and hand them the link.",
      inputSchema: {
        keywords: z.string().optional().describe('Title, skill or company, e.g. "senior python engineer".'),
        location: z.string().optional().describe('City, region or country, e.g. "London, United Kingdom".'),
        workplace: z.array(z.enum(keys(WORKPLACE))).optional(),
        posted_within: z.enum(keys(POSTED_WITHIN)).optional(),
        experience: z.array(z.enum(keys(EXPERIENCE))).optional(),
        job_type: z.array(z.enum(keys(JOB_TYPE))).optional(),
        easy_apply: z.boolean().optional(),
        distance_miles: z.number().int().min(0).max(100).optional(),
        sort: z.enum(["relevance", "recent"]).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: {
      keywords?: string;
      location?: string;
      workplace?: JobSearch["workplace"];
      posted_within?: JobSearch["postedWithin"];
      experience?: JobSearch["experience"];
      job_type?: JobSearch["jobType"];
      easy_apply?: boolean;
      distance_miles?: number;
      sort?: JobSearch["sort"];
    }) => ({
      url: buildJobSearchUrl({
        keywords: a.keywords,
        location: a.location,
        workplace: a.workplace,
        postedWithin: a.posted_within,
        experience: a.experience,
        jobType: a.job_type,
        easyApply: a.easy_apply,
        distanceMiles: a.distance_miles,
        sort: a.sort,
      }),
    })),
  );
}
