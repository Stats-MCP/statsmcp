#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createSistatServer } from '@/index';

const server = createSistatServer();
await server.connect(new StdioServerTransport());
