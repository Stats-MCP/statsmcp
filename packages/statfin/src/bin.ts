#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createStatfinServer } from '@/index';

const server = createStatfinServer();
await server.connect(new StdioServerTransport());
