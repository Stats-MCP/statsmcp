#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createSingstatServer } from '@/index';

const server = createSingstatServer();
await server.connect(new StdioServerTransport());
