#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createIneEsServer, ineEsPreset } from '@/index';

const server = createIneEsServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${ineEsPreset.name}-mcp/${ineEsPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
