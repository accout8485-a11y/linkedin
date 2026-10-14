import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, list, postUrn, raw, record, restliDate, urnPath } from "../src/restli.ts";

test("list encodes URNs inside List()", () => {
  assert.equal(list(["urn:li:share:1", "urn:li:share:2"]).value, "List(urn%3Ali%3Ashare%3A1,urn%3Ali%3Ashare%3A2)");
});

test("record nests and escapes", () => {
  assert.equal(
    record({ timeRange: record({ start: 1, end: 2 }), timeGranularityType: raw("DAY") }).value,
    "(timeRange:(start:1,end:2),timeGranularityType:DAY)",
  );
  assert.equal(record({ share: "urn:li:share:9" }).value, "(share:urn%3Ali%3Ashare%3A9)");
});

test("buildQuery escapes plain values but not Raw, and drops undefined", () => {
  assert.equal(
    buildQuery({ q: "author", author: "urn:li:person:abc", ids: raw("List(1,2)"), skip: undefined }),
    "?q=author&author=urn%3Ali%3Aperson%3Aabc&ids=List(1,2)",
  );
  assert.equal(buildQuery({}), "");
});

test("postUrn accepts URNs and linkedin.com URLs", () => {
  assert.equal(postUrn("urn:li:share:123"), "urn:li:share:123");
  assert.equal(postUrn("https://www.linkedin.com/feed/update/urn:li:activity:7100/"), "urn:li:activity:7100");
  assert.equal(postUrn("https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A55"), "urn:li:ugcPost:55");
  assert.equal(postUrn("https://www.linkedin.com/posts/jane_hello-activity-7123456789-abcd"), "urn:li:activity:7123456789");
  assert.throws(() => postUrn("not a post"));
});

test("urnPath and restliDate", () => {
  assert.equal(urnPath("urn:li:share:1"), "urn%3Ali%3Ashare%3A1");
  assert.equal(restliDate("2026-02-01").value, "(day:1,month:2,year:2026)");
  assert.throws(() => restliDate("nope"));
});
