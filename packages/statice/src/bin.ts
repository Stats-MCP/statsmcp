#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from 'pxweb-mcp/node';

import { createStaticeServer, staticePreset } from '@/index';

const server = createStaticeServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${staticePreset.name}-mcp/${staticePreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
