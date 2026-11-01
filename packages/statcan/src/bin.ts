#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from 'pxweb-mcp/node';

import { createStatcanServer, statcanPreset } from '@/index';

const server = createStatcanServer({
  tableSnapshots: nodeTableSnapshots(
    new URL('../snapshots/', import.meta.url),
    {
      userAgent: `${statcanPreset.name}-mcp/${statcanPreset.version}`
    }
  )
});
await server.connect(new StdioServerTransport());
