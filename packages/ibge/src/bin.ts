#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createIbgeServer } from '@/index';

const server = createIbgeServer();
await server.connect(new StdioServerTransport());
