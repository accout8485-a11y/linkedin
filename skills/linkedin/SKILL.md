---
name: linkedin
description: Use when the user wants to do anything on LinkedIn — write, publish, edit or delete posts; comment on or react to posts; manage a company page; check impressions, engagement or follower analytics; or look for jobs. Covers how to use the linkedin_* MCP tools safely.
---

# Working with LinkedIn

The `linkedin` MCP server talks to LinkedIn's official REST API as the signed-in member.

## Before anything else

1. Call `linkedin_auth_status`. If `authenticated` is false, call `linkedin_login`, give the user the
   `open_this_url` link, and wait for them to say they've approved it. If the redirect page fails
   to load (browser on another machine), ask them to paste the URL from the address bar and pass it
   to `linkedin_exchange_code`.
2. If `client_configured` is false, the user must first create a LinkedIn app and set
   `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` (see the plugin README).

## Writing is public — always confirm

`linkedin_create_post`, `linkedin_reshare_post`, `linkedin_update_post`, `linkedin_delete_post`,
`linkedin_comment`, `linkedin_delete_comment` and any non-GET `linkedin_api_request` act on the
user's real account immediately. Show the exact final text (and the target post or page) and get a
clear "yes" before calling them. Never post, comment or react on your own initiative, in bulk, or to
automate engagement.

When drafting posts: lead with a strong first line (only ~2 lines show before "see more"), keep
paragraphs short, end with a question or call to action, and use 3–5 relevant `#hashtags` — the
tool turns them into real hashtags and escapes other special characters automatically. Limit 3,000
characters.

## Insights

- One post: `linkedin_get_social_metadata` (reaction/comment counts) and, with the analytics scope,
  `linkedin_my_post_analytics` with `post` set (impressions, reach, reshares).
- All of the member's posts: `linkedin_my_post_analytics` without `post`; use `aggregation: DAILY` and
  a date range for trends. Followers: `linkedin_my_follower_count`.
- Company pages: `linkedin_list_my_organizations` to find the org URN, then
  `linkedin_org_share_stats`, `linkedin_org_follower_stats`, `linkedin_org_page_stats`,
  `linkedin_org_follower_count`.

Summarise numbers for the user (totals, best performers, engagement rate = engagements ÷
impressions, trend direction) rather than dumping raw JSON.

## Jobs

LinkedIn has no public jobs API. Use `linkedin_job_search_link` to turn the user's criteria into a
filtered linkedin.com search URL and give them the link. Do not scrape linkedin.com.

## When a call fails

- 401: token expired → `linkedin_login`.
- 403: the user's LinkedIn app lacks the product for that endpoint (e.g. reading member posts and
  analytics or company pages needs Community Management API approval). Explain which access is
  missing rather than retrying.
- 426: set `LINKEDIN_API_VERSION` to a supported `YYYYMM`.

For endpoints without a dedicated tool, `linkedin_api_request` calls any `/rest/` or `/v2/` path.
