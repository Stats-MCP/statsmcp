#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createBdlServer, bdlPreset } from '@/index';

const clientId = process.env.BDL_CLIENT_ID?.trim();
const server = createBdlServer({
  ...(clientId && { clientId }),
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${bdlPreset.name}-mcp/${bdlPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
