#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createStatecServer, statecPreset } from '@/index';

const server = createStatecServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${statecPreset.name}-mcp/${statecPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
