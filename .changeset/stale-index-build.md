---
'@statsmcp/core': patch
---

Search no longer waits on an index build that never finished. On Cloudflare Workers, a build stopped by the CPU limit made later searches fail; now a later search starts a new build.
