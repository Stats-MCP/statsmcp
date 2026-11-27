#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createStatbelServer } from '@/index';

const server = createStatbelServer();
await server.connect(new StdioServerTransport());
