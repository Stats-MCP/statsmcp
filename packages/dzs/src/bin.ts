#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createDzsServer, dzsPreset } from '@/index';

const server = createDzsServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${dzsPreset.name}-mcp/${dzsPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
