#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createDstServer } from '@/index';

const server = createDstServer();
await server.connect(new StdioServerTransport());
