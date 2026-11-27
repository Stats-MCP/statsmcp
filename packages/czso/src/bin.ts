#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createCzsoServer } from '@/index';

const server = createCzsoServer();
await server.connect(new StdioServerTransport());
