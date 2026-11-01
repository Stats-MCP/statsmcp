#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createEurostatServer } from '@/index';

const server = createEurostatServer();
await server.connect(new StdioServerTransport());
