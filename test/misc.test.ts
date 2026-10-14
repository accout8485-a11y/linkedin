import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJobSearchUrl } from "../src/jobs.ts";
import { defaultApiVersion, loadConfig } from "../src/config.ts";
import { buildAuthUrl, parseCode } from "../src/auth.ts";
import { toLittleText } from "../src/tools/util.ts";

test("job search URL maps filters to LinkedIn params", () => {
  const url = new URL(
    buildJobSearchUrl({
      keywords: "data engineer",
      location: "Berlin",
      workplace: ["remote", "hybrid"],
      postedWithin: "week",
      experience: ["mid_senior"],
      jobType: ["full_time", "contract"],
      easyApply: true,
      sort: "recent",
    }),
  );
  assert.equal(url.pathname, "/jobs/search/");
  assert.equal(url.searchParams.get("keywords"), "data engineer");
  assert.equal(url.searchParams.get("f_WT"), "2,3");
  assert.equal(url.searchParams.get("f_TPR"), "r604800");
  assert.equal(url.searchParams.get("f_E"), "4");
  assert.equal(url.searchParams.get("f_JT"), "F,C");
  assert.equal(url.searchParams.get("f_AL"), "true");
  assert.equal(url.searchParams.get("sortBy"), "DD");
  assert.equal(buildJobSearchUrl({}), "https://www.linkedin.com/jobs/search/");
});

test("default API version is two months back", () => {
  assert.equal(defaultApiVersion(new Date("2026-10-14T00:00:00Z")), "202608");
  assert.equal(defaultApiVersion(new Date("2026-01-31T00:00:00Z")), "202511");
});

test("config reads env and builds auth URL", () => {
  const c = loadConfig({ LINKEDIN_CLIENT_ID: "id", LINKEDIN_SCOPES: "openid, w_member_social", LINKEDIN_API_VERSION: "202601" });
  assert.deepEqual(c.scopes, ["openid", "w_member_social"]);
  assert.equal(c.apiVersion, "202601");
  const url = new URL(buildAuthUrl(c, "s"));
  assert.equal(url.searchParams.get("scope"), "openid w_member_social");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:8765/callback");
});

test("parseCode accepts code or redirect URL", () => {
  assert.equal(parseCode(" abc "), "abc");
  assert.equal(parseCode("http://localhost:8765/callback?code=xyz&state=1"), "xyz");
});

test("little text escapes reserved characters and links hashtags", () => {
  assert.equal(toLittleText("Hi (all) #AI_news!"), "Hi \\(all\\) {hashtag|\\#|AI\\_news}!");
  assert.equal(toLittleText("a@b [x]"), "a\\@b \\[x\\]");
});
