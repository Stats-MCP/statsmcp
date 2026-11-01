#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createStatcanServer } from '@/index';

const server = createStatcanServer();
await server.connect(new StdioServerTransport());
