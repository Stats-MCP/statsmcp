#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createScbServer } from '@/index';

const server = createScbServer();
await server.connect(new StdioServerTransport());
