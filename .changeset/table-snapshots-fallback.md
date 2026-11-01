---
'pxweb-mcp': minor
'dst-mcp': minor
'cbs-mcp': minor
'scb-mcp': minor
'statsmcp-eurostat': minor
'statsmcp-statcan': minor
---

If the live table list of a source fails, search uses a crawled snapshot: first from statsmcp.dev, then the copy in the package. Set `STATSMCP_INDEX=off` to stop the requests to statsmcp.dev. New exports: `createPresetClient`, the `tableSnapshots` server option and `pxweb-mcp/node` (`nodeTableSnapshots`).
