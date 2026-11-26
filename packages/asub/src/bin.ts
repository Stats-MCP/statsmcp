#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createAsubServer } from '@/index';

const server = createAsubServer();
await server.connect(new StdioServerTransport());
