#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createOspServer } from '@/index';

const server = createOspServer();
await server.connect(new StdioServerTransport());
