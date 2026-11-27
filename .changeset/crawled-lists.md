---
'@statsmcp/core': patch
---

The Statistics Lithuania and IBGE clients search a crawled table list first when one is given (`crawledList`), so the hosted worker no longer downloads their whole catalogues.
