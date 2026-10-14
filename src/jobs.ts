/**
 * LinkedIn's job search and job application APIs are closed to partners, so
 * this builds a linkedin.com job search URL the user can open instead of
 * scraping results.
 */

export const WORKPLACE = { on_site: "1", remote: "2", hybrid: "3" } as const;
export const POSTED_WITHIN = { day: "r86400", week: "r604800", month: "r2592000" } as const;
export const EXPERIENCE = {
  internship: "1",
  entry: "2",
  associate: "3",
  mid_senior: "4",
  director: "5",
  executive: "6",
} as const;
export const JOB_TYPE = {
  full_time: "F",
  part_time: "P",
  contract: "C",
  temporary: "T",
  internship: "I",
  volunteer: "V",
  other: "O",
} as const;

export interface JobSearch {
  keywords?: string;
  location?: string;
  workplace?: Array<keyof typeof WORKPLACE>;
  postedWithin?: keyof typeof POSTED_WITHIN;
  experience?: Array<keyof typeof EXPERIENCE>;
  jobType?: Array<keyof typeof JOB_TYPE>;
  easyApply?: boolean;
  distanceMiles?: number;
  sort?: "relevance" | "recent";
}

export function buildJobSearchUrl(s: JobSearch): string {
  const p = new URLSearchParams();
  if (s.keywords) p.set("keywords", s.keywords);
  if (s.location) p.set("location", s.location);
  if (s.workplace?.length) p.set("f_WT", s.workplace.map((w) => WORKPLACE[w]).join(","));
  if (s.postedWithin) p.set("f_TPR", POSTED_WITHIN[s.postedWithin]);
  if (s.experience?.length) p.set("f_E", s.experience.map((e) => EXPERIENCE[e]).join(","));
  if (s.jobType?.length) p.set("f_JT", s.jobType.map((j) => JOB_TYPE[j]).join(","));
  if (s.easyApply) p.set("f_AL", "true");
  if (s.distanceMiles !== undefined) p.set("distance", String(s.distanceMiles));
  if (s.sort) p.set("sortBy", s.sort === "recent" ? "DD" : "R");
  const qs = p.toString();
  return `https://www.linkedin.com/jobs/search/${qs ? `?${qs}` : ""}`;
}
