import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { PxwebPreset } from '@/preset';
import type { PxwebClient } from '@/pxweb-client';
import {
  includeArchivedSchema,
  limitSchema,
  searchQuerySchema,
  SEARCH_DESCRIPTION,
  searchTables
} from '@/tools/search-tools';
import {
  getTableMetadata,
  METADATA_DESCRIPTION,
  queryTableDescription,
  queryTable,
  selectionsSchema,
  tableIdSchema,
  valueFilterSchema
} from '@/tools/table-tools';
import { readAnnotations, textResult, toolError } from '@/tools/tool-result';

import type { CallToolResult } from '@modelcontextprotocol/server';

export interface MultiServerEntry {
  code: string;
  preset: PxwebPreset;
  /** Called at most once, when a tool call first uses this country. */
  client: () => PxwebClient;
}

export interface MultiServerOptions {
  name: string;
  title: string;
  version: string;
}

const INSTRUCTIONS = `Official statistics from many national statistics offices and Eurostat. This server is not affiliated with or endorsed by any of them.

To answer a question with data:
1. Choose the country code. Call \`list_countries\` if you are not sure, and call it with a country code to read the hints for that office.
2. Call \`search_tables\` with the country and short topic keywords. Always search first, unless the user gives a table id. Use only table ids from search results or from the user.
3. Call \`get_table_metadata\`, then \`query_table\` with only the values you need. Use \`latest\` for recent periods.
4. To compare countries, query each country separately. Say which office each number comes from.

Always cite the source line that each result ends with. If you calculate new figures, say they are your own calculation.`;

export function createMultiServer(
  entries: readonly MultiServerEntry[],
  options: MultiServerOptions
): McpServer {
  const [first, ...rest] = entries.map((entry) => entry.code);
  if (first === undefined) {
    throw new Error('createMultiServer needs at least one country.');
  }
  const byCode = new Map(entries.map((entry) => [entry.code, entry]));
  if (byCode.size !== entries.length) {
    throw new Error('createMultiServer needs unique country codes.');
  }
  const searchLimits = new Set(
    entries.map((entry) => entry.preset.searchLimit)
  );
  const [sharedLimit] = searchLimits;
  const limitArg =
    searchLimits.size === 1 && sharedLimit !== undefined
      ? limitSchema(sharedLimit)
      : limitSchema(0).describe(
          "Maximum results. Default: the country's own limit."
        );
  const clients = new Map<string, PxwebClient>();
  const country = z
    .enum([first, ...rest])
    .describe('Country code from list_countries; "eu" is Eurostat.');
  const lang = z
    .string()
    .optional()
    .describe(
      'Language of your search words and of the labels, for example "is" for Icelandic. Default: the country\'s first language (see list_countries).'
    );

  function resolve(
    code: string,
    language: string | undefined
  ):
    | { preset: PxwebPreset; client: PxwebClient; lang: string }
    | { error: CallToolResult } {
    const entry = byCode.get(code);
    if (!entry) {
      return {
        error: toolError(
          `Unknown country "${code}". Valid codes: ${[...byCode.keys()].join(', ')}.`
        )
      };
    }
    const { languages } = entry.preset;
    const chosen = language ?? languages[0];
    if (!languages.includes(chosen)) {
      return {
        error: toolError(
          `Country "${code}" has no language "${chosen}". Use one of: ${languages.join(', ')}.`
        )
      };
    }
    let client = clients.get(code);
    if (!client) {
      try {
        client = entry.client();
      } catch (err) {
        console.error('Could not create the client', code, err);
        return { error: toolError(`Country "${code}" is not available now.`) };
      }
      clients.set(code, client);
    }
    return { preset: entry.preset, client, lang: chosen };
  }

  const server = new McpServer(
    { name: options.name, title: options.title, version: options.version },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool(
    'list_countries',
    {
      title: 'List countries',
      description:
        'List the country codes, offices and languages. With a country code, show the hints for that office.',
      inputSchema: z.object({
        country: country.optional()
      }),
      annotations: readAnnotations('List countries')
    },
    async ({ country: code }) => {
      if (code !== undefined) {
        const entry = byCode.get(code);
        return entry
          ? textResult(`${entry.preset.title}\n\n${entry.preset.instructions}`)
          : toolError(`Unknown country "${code}".`);
      }
      return textResult(
        entries
          .map(
            (entry) =>
              `${entry.code} | ${entry.preset.title} | languages: ${entry.preset.languages.join(', ')}`
          )
          .join('\n')
      );
    }
  );

  server.registerTool(
    'search_tables',
    {
      title: 'Search statistical tables',
      description: SEARCH_DESCRIPTION,
      inputSchema: z.object({
        country,
        query: searchQuerySchema,
        lang,
        limit: limitArg,
        includeArchived: includeArchivedSchema
      }),
      annotations: readAnnotations('Search statistical tables')
    },
    async ({
      country: code,
      query,
      lang: language,
      limit,
      includeArchived
    }) => {
      const target = resolve(code, language);
      if ('error' in target) return target.error;
      return searchTables(target.client, target.preset, {
        query,
        lang: target.lang,
        limit: limit ?? target.preset.searchLimit,
        includeArchived: includeArchived ?? false
      });
    }
  );

  server.registerTool(
    'get_table_metadata',
    {
      title: 'Get table variables',
      description: METADATA_DESCRIPTION,
      inputSchema: z.object({
        country,
        tableId: tableIdSchema,
        lang,
        valueFilter: valueFilterSchema
      }),
      annotations: readAnnotations('Get table variables')
    },
    async ({ country: code, tableId, lang: language, valueFilter }) => {
      const target = resolve(code, language);
      if ('error' in target) return target.error;
      return getTableMetadata(target.client, target.preset, {
        tableId,
        lang: target.lang,
        valueFilter
      });
    }
  );

  const maxCells = Math.min(...entries.map((entry) => entry.preset.maxCells));
  server.registerTool(
    'query_table',
    {
      title: 'Query table data',
      description: queryTableDescription(maxCells),
      inputSchema: z.object({
        country,
        tableId: tableIdSchema,
        lang,
        selections: selectionsSchema
      }),
      annotations: readAnnotations('Query table data')
    },
    async ({ country: code, tableId, lang: language, selections }) => {
      const target = resolve(code, language);
      if ('error' in target) return target.error;
      return queryTable(target.client, target.preset, {
        tableId,
        lang: target.lang,
        selections
      });
    }
  );

  return server;
}
