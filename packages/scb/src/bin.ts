#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';

import { createScbServer, scbPreset } from '@/index';

const server = createScbServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${scbPreset.name}-mcp/${scbPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
