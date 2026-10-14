# LinkedIn for Claude

A Claude Code plugin (and standalone MCP server) that lets Claude work with your LinkedIn account
through LinkedIn's **official API**: publish and manage posts, comment and react, run company pages,
pull analytics, and build job searches.

It uses OAuth and the documented REST endpoints only — no scraping, no password sharing — so it
won't put your account at risk.

## What Claude can do

| Area | Tools |
| --- | --- |
| Account | `linkedin_login`, `linkedin_exchange_code`, `linkedin_auth_status`, `linkedin_logout`, `linkedin_get_profile` |
| Posts | `linkedin_create_post` (text, link preview, 1–20 images, drafts, as you or a page), `linkedin_reshare_post`, `linkedin_get_post`, `linkedin_list_posts`, `linkedin_update_post`, `linkedin_delete_post` |
| Engagement | `linkedin_comment` (and replies), `linkedin_list_comments`, `linkedin_delete_comment`, `linkedin_react`, `linkedin_remove_reaction`, `linkedin_list_reactions`, `linkedin_get_social_metadata` |
| Company pages | `linkedin_list_my_organizations`, `linkedin_get_organization`, `linkedin_org_follower_count`, `linkedin_org_follower_stats`, `linkedin_org_share_stats`, `linkedin_org_page_stats` |
| Your insights | `linkedin_my_post_analytics` (impressions, reach, reactions, comments, reshares; total or daily), `linkedin_my_follower_count` |
| Jobs | `linkedin_job_search_link` — filtered linkedin.com job search URL |
| Anything else | `linkedin_api_request` — call any `/rest/` or `/v2/` endpoint with auth handled |

It also ships a `linkedin` skill (safe-usage and writing guidance for Claude) and two slash commands:
`/linkedin-post <topic>` and `/linkedin-insights [page or range]`.

## Access levels — read this first

LinkedIn gates its API by "products" you add to your developer app. What works depends on what your
app has been granted:

| Product (developer portal) | Approval | Unlocks |
| --- | --- | --- |
| Sign In with LinkedIn using OpenID Connect | Instant | Profile (`openid profile email`) |
| Share on LinkedIn | Instant | Create / reshare / edit / delete your posts, comment, react (`w_member_social`) |
| Community Management API | Application & review | Read your posts and their comments (`r_member_social`), post analytics (`r_member_postAnalytics`), follower stats (`r_member_profileAnalytics`), company pages (`r_organization_social`, `w_organization_social`, `rw_organization_admin`, `r_organization_admin`) |

**Jobs:** LinkedIn's job search, job posting and apply APIs are limited to approved ATS/job-board
partners, so this plugin can't list or apply to jobs for you. `linkedin_job_search_link` builds the
exact filtered search instead (keywords, location, remote/hybrid, date posted, seniority, type, Easy
Apply).

Messaging, connection requests and reading other people's profiles or feeds are not available
through the public API at all.

## Setup

### 1. Create a LinkedIn app

1. Go to <https://www.linkedin.com/developers/apps> → **Create app** (it must be linked to a
   LinkedIn Page; any page you admin works).
2. **Products** tab: add *Sign In with LinkedIn using OpenID Connect* and *Share on LinkedIn*.
   Request *Community Management API* too if you want analytics and company pages.
3. **Auth** tab: add the redirect URL `http://localhost:8765/callback`, and copy the
   **Client ID** and **Client Secret**.

### 2. Set environment variables

```bash
export LINKEDIN_CLIENT_ID=...
export LINKEDIN_CLIENT_SECRET=...
# Only if Community Management API is approved:
export LINKEDIN_SCOPES="openid profile email w_member_social r_member_social r_member_postAnalytics r_member_profileAnalytics r_organization_social w_organization_social rw_organization_admin r_organization_admin"
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | — | Your app credentials (needed for login) |
| `LINKEDIN_SCOPES` | `openid profile email w_member_social` | Space/comma-separated scopes to request |
| `LINKEDIN_REDIRECT_URI` | `http://localhost:8765/callback` | Must match the app's Auth settings |
| `LINKEDIN_ACCESS_TOKEN` | — | Use a token you already have instead of logging in |
| `LINKEDIN_API_VERSION` | two months before today (`YYYYMM`) | `LinkedIn-Version` header |
| `LINKEDIN_TOKEN_PATH` | `~/.config/linkedin-mcp/token.json` | Where the token is stored (mode 600) |

### 3. Install

**Claude Code plugin**

```
/plugin marketplace add accout8485-a11y/linkedin
/plugin install linkedin@linkedin
```

**Claude Code without the plugin system**

```bash
git clone https://github.com/accout8485-a11y/linkedin.git
claude mcp add linkedin -e LINKEDIN_CLIENT_ID=... -e LINKEDIN_CLIENT_SECRET=... -- node "$PWD/linkedin/dist/server.js"
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "node",
      "args": ["/absolute/path/to/linkedin/dist/server.js"],
      "env": { "LINKEDIN_CLIENT_ID": "...", "LINKEDIN_CLIENT_SECRET": "..." }
    }
  }
}
```

`dist/server.js` is a committed, dependency-free bundle, so no `npm install` is needed to run it
(Node 20+).

### 4. Connect your account

Ask Claude to "connect my LinkedIn" — it calls `linkedin_login` and gives you a link. Approve
access in the browser and you're done. Or from a terminal: `node dist/server.js auth`.

LinkedIn member tokens last 60 days; Claude will ask you to log in again when one expires.

## Examples

- "Draft a LinkedIn post announcing our new feature, with these notes: … Show me before posting."
- "How did my last 5 posts do? Which one got the best engagement rate?"
- "Reply to the top comments on my latest post, but show me the replies first."
- "Post this update as our company page and attach `launch.png`."
- "Find remote senior product designer jobs in Europe posted this week."

## Development

```bash
npm install
npm run check      # typecheck + tests + build
npm run build      # regenerate dist/server.js — commit it with source changes
```

Source lives in `src/` (`client.ts` for HTTP and auth headers, `restli.ts` for Rest.li encoding,
`tools/` for each tool group). Tests run on Node's built-in test runner with type stripping.

## License

MIT
