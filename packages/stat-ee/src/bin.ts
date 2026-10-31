#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createStatEeServer } from '@/index';

const server = createStatEeServer();
await server.connect(new StdioServerTransport());
