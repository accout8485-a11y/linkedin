---
description: Draft a LinkedIn post with Claude, then publish it after your approval
argument-hint: [topic or rough notes]
---

Help me write a LinkedIn post about: $ARGUMENTS

1. Check `linkedin_auth_status`; if I'm not connected, run `linkedin_login` and give me the link.
2. Ask at most one clarifying question if the topic is too vague, otherwise draft the post following the linkedin skill's writing guidance. Offer the draft plus one shorter alternative.
3. Only after I explicitly approve a version, publish it with `linkedin_create_post` and give me the post link.
