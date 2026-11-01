#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createEurostatServer, eurostatPreset } from '@/index';

const server = createEurostatServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${eurostatPreset.name}-mcp/${eurostatPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
