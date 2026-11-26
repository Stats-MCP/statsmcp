#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createMakstatServer } from '@/index';

const server = createMakstatServer();
await server.connect(new StdioServerTransport());
