#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createCbsServer, cbsPreset } from '@/index';

const server = createCbsServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${cbsPreset.name}-mcp/${cbsPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
