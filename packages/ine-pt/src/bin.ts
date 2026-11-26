#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createInePtServer, inePtPreset } from '@/index';

const server = createInePtServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${inePtPreset.name}-mcp/${inePtPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
