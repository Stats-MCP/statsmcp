import { z } from 'zod';

import type { PxwebPreset } from '@/preset';
import type { PxwebClient } from '@/pxweb-client';
import { readAnnotations, runTool, textResult } from '@/tools/tool-result';

import type { McpServer } from '@modelcontextprotocol/server';

export function registerSearchTools(
  server: McpServer,
  client: PxwebClient,
  preset: PxwebPreset
): void {
  server.registerTool(
    'search_tables',
    {
      title: 'Search statistical tables',
      description:
        'Find tables by keywords in their titles. Returns table ids, titles and publish dates, best match first. Search with short topic words, for example "unemployment municipalities", not full questions.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Keywords to search for.'),
        lang: z
          .enum(preset.languages)
          .optional()
          .describe(`Language of titles. Default "${preset.languages[0]}".`),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(`Maximum results. Default ${preset.searchLimit}.`)
      }),
      annotations: readAnnotations('Search statistical tables')
    },
    async ({ query, lang = preset.languages[0], limit = preset.searchLimit }) =>
      runTool(async () => {
        const hits = await client.search(lang, query);
        if (!hits.length) {
          return textResult(
            `No tables match "${query}". Try fewer or broader keywords, or the other language.`
          );
        }
        const lines = hits
          .slice(0, limit)
          .map(
            (hit) =>
              `${hit.tableId} | ${hit.title}${hit.published ? ` | ${hit.published.slice(0, 10)}` : ''}`
          );
        return textResult(
          `${hits.length} tables match; showing ${lines.length}.\n${lines.join('\n')}\n\n${preset.attribution(lang)}`
        );
      })
  );
}
