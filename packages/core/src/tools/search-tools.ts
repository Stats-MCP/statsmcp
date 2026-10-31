import { z } from 'zod';

import type { PxwebPreset } from '@/preset';
import type { PxwebClient, TableSearchHit } from '@/pxweb-client';
import { rankSearchHits } from '@/search-ranking';
import { readAnnotations, runTool, textResult } from '@/tools/tool-result';

import type { McpServer } from '@modelcontextprotocol/server';

function normalize(text: string, lang: string): string {
  return text.toLocaleLowerCase(lang).normalize('NFD').replace(/\p{M}/gu, '');
}

function startsWord(text: string, term: string): boolean {
  let index = text.indexOf(term);
  while (index >= 0) {
    if (!/\p{L}/u.test(text[index - 1] ?? ' ')) return true;
    index = text.indexOf(term, index + 1);
  }
  return false;
}

async function searchWithAliases(
  client: PxwebClient,
  preset: PxwebPreset,
  lang: string,
  query: string
): Promise<TableSearchHit[]> {
  const text = normalize(query, lang);
  const aliasQueries = (preset.searchAliases?.[lang] ?? [])
    .filter((alias) =>
      alias.terms.some((term) => startsWord(text, normalize(term, lang)))
    )
    .map((alias) => alias.query);
  const [original, ...aliases] = await Promise.allSettled(
    [query, ...aliasQueries].map((search) => client.search(lang, search))
  );
  if (original?.status === 'rejected') throw original.reason;
  const aliasHits = aliases.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );
  const seen = new Set<string>();
  const merged = [...aliasHits, ...(original?.value ?? [])].filter((hit) => {
    if (seen.has(hit.tableId)) return false;
    seen.add(hit.tableId);
    return true;
  });
  return rankSearchHits(merged, new Date().getUTCFullYear());
}

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
        const hits = await searchWithAliases(client, preset, lang, query);
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
