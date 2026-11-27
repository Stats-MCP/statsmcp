---
'@statsmcp/core': minor
---

Snapshots can carry a prebuilt search index (`searchIndex`), so search loads it instead of building it. The crawler writes it, and `crawl --reindex` adds it to existing snapshots.
