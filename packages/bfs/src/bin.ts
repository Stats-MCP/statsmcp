#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createBfsServer, bfsPreset } from '@/index';

const server = createBfsServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${bfsPreset.name}-mcp/${bfsPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
