#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from 'pxweb-mcp/node';

import { createCsoServer, csoPreset } from '@/index';

const server = createCsoServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${csoPreset.name}-mcp/${csoPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
