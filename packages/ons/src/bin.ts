#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createOnsServer } from '@/index';

const server = createOnsServer();
await server.connect(new StdioServerTransport());
