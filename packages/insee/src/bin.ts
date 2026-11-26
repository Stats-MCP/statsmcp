#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createInseeServer, inseePreset } from '@/index';

const server = createInseeServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${inseePreset.name}-mcp/${inseePreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
