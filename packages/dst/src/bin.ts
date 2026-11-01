#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createDstServer, dstPreset } from '@/index';

const server = createDstServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${dstPreset.name}-mcp/${dstPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
