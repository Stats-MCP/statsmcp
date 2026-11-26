#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createKasServer } from '@/index';

const server = createKasServer();
await server.connect(new StdioServerTransport());
