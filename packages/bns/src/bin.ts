#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createBnsServer, bnsPreset } from '@/index';

const server = createBnsServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${bnsPreset.name}-mcp/${bnsPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
