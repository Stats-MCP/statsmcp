#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createCbsServer } from '@/index';

const server = createCbsServer();
await server.connect(new StdioServerTransport());
