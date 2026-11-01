import { z } from 'zod';

import type { PxwebPreset } from '@/preset';
import type { PxwebClient, TableSearchHit } from '@/pxweb-client';
import { normalize, startsWord } from '@/text';
import { checkSearchInput } from '@/tools/input-limits';
import { toolInput } from '@/tools/tool-input';
import { readAnnotations, runTool, textResult } from '@/tools/tool-result';

import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';

async function searchWithAliases(
  client: PxwebClient,
  preset: PxwebPreset,
  lang: string,
  query: string,
  includeArchived: boolean
): Promise<TableSearchHit[]> {
  const text = normalize(query, lang);
  const aliasQueries = (preset.searchAliases?.[lang] ?? [])
    .filter((alias) =>
      alias.terms.some((term) => startsWord(text, normalize(term, lang)))
    )
    .map((alias) => alias.query);
  const [original, ...aliases] = await Promise.allSettled(
    [query, ...aliasQueries].map((search) =>
      client.search(lang, search, { includeArchived })
    )
  );
  if (original?.status === 'rejected') throw original.reason;
  const aliasHits = aliases.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );
  const seen = new Set<string>();
  return [...aliasHits, ...(original?.value ?? [])].filter((hit) => {
    if (seen.has(hit.tableId) || (hit.archived && !includeArchived))
      return false;
    seen.add(hit.tableId);
    return true;
  });
}

export const SEARCH_DESCRIPTION =
  'Find tables by keywords in their titles. Returns table ids, titles and publish dates, best match first. Search with short topic words, for example "unemployment municipalities", not full questions.';

export const searchQuerySchema = z
  .string()
  .min(2)
  .describe('Keywords to search for.');

export const limitSchema = (searchLimit: number) =>
  z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(`Maximum results. Default ${searchLimit}.`);

export const includeArchivedSchema = z
  .boolean()
  .optional()
  .describe('Also list discontinued tables, for older periods. Default false.');

export function searchTables(
  client: PxwebClient,
  preset: PxwebPreset,
  args: {
    query: string;
    lang: string;
    limit: number;
    includeArchived: boolean;
  }
): Promise<CallToolResult> {
  const { query, lang, limit, includeArchived } = args;
  return runTool(async () => {
    checkSearchInput(query);
    const hits = await searchWithAliases(
      client,
      preset,
      lang,
      query,
      includeArchived
    );
    if (!hits.length) {
      const archived = includeArchived
        ? []
        : await searchWithAliases(client, preset, lang, query, true);
      if (archived.length) {
        return textResult(
          `No current tables match "${query}", but ${archived.length} discontinued tables do. Call search_tables again with includeArchived: true to list them.`
        );
      }
      return textResult(
        `No tables match "${query}". Try fewer or broader keywords, or the other language.`
      );
    }
    const lines = hits
      .slice(0, limit)
      .map(
        (hit) =>
          `${hit.tableId} | ${hit.title}${hit.published ? ` | ${hit.published.slice(0, 10)}` : ''}${hit.archived ? ' | archived' : ''}`
      );
    return textResult(
      `${hits.length} tables match; showing ${lines.length}.\n${lines.join('\n')}\n\n${preset.attribution(lang)}`
    );
  });
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
      description: SEARCH_DESCRIPTION,
      inputSchema: toolInput({
        query: searchQuerySchema,
        lang: z
          .enum(preset.languages)
          .optional()
          .describe(`Language of titles. Default "${preset.languages[0]}".`),
        limit: limitSchema(preset.searchLimit),
        includeArchived: includeArchivedSchema
      }),
      annotations: readAnnotations('Search statistical tables')
    },
    async ({
      query,
      lang = preset.languages[0],
      limit = preset.searchLimit,
      includeArchived = false
    }) => searchTables(client, preset, { query, lang, limit, includeArchived })
  );
}
