#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from 'pxweb-mcp/node';

import { createAbsServer, absPreset } from '@/index';

const server = createAbsServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${absPreset.name}-mcp/${absPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
