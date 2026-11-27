---
'@statsmcp/core': patch
---

The INSEE client keeps only finished tables in its table cache, so a load stopped on Cloudflare Workers no longer breaks later requests.
