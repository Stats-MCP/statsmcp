#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createHagstovaServer } from '@/index';

const server = createHagstovaServer();
await server.connect(new StdioServerTransport());
