---
description: Summarise how your LinkedIn posts (or a company page) are performing
argument-hint: [optional: company page name, post URL, or date range]
---

Give me a LinkedIn performance report for: ${ARGUMENTS:-my own posts over the last 30 days}

Use the linkedin_* analytics tools (see the linkedin skill). Report totals, the best and worst performing posts, engagement rate, follower change, and two or three concrete suggestions. If a tool returns 403, tell me which LinkedIn API access my app is missing and report what you could get.
