#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createSsbServer } from '@/index';

const server = createSsbServer();
await server.connect(new StdioServerTransport());
