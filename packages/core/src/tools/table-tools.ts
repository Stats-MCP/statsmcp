import { z } from 'zod';

import { toCsv } from '@/json-stat';
import { formatMetadata } from '@/metadata';
import type { PxwebPreset } from '@/preset';
import type { PxwebClient } from '@/pxweb-client';
import { planQuery } from '@/query-plan';
import { readAnnotations, runTool, textResult } from '@/tools/tool-result';

import type { McpServer } from '@modelcontextprotocol/server';

const tableId = z
  .string()
  .min(1)
  .describe('Table id exactly as search_tables returns it.');

export function registerTableTools(
  server: McpServer,
  client: PxwebClient,
  preset: PxwebPreset
): void {
  const lang = z
    .enum(preset.languages)
    .optional()
    .describe(`Language of labels. Default "${preset.languages[0]}".`);

  function sourceLine(language: string, id: string): string {
    return `${preset.attribution(language)}, table ${id}: ${preset.tableUrl(language, id)}`;
  }

  server.registerTool(
    'get_table_metadata',
    {
      title: 'Get table variables',
      description:
        'List the variables of a table and their value codes. Call this before query_table. Long value lists are shortened; use valueFilter to find specific values, for example a municipality name.',
      inputSchema: z.object({
        tableId,
        lang,
        valueFilter: z
          .string()
          .optional()
          .describe(
            'Show only values whose label contains this text, for example "Ljubljana".'
          )
      }),
      annotations: readAnnotations('Get table variables')
    },
    async ({
      tableId: id,
      lang: language = preset.languages[0],
      valueFilter
    }) =>
      runTool(async () => {
        const metadata = await client.getMetadata(language, id);
        return textResult(
          `${formatMetadata(id, metadata, valueFilter)}\n\nOptional variables can be left out; the result then shows their total. Required variables left out return all their values.\n\n${sourceLine(language, id)}`
        );
      })
  );

  server.registerTool(
    'query_table',
    {
      title: 'Query table data',
      description: `Get data from a table as CSV with readable labels. For each variable, give value codes from get_table_metadata, or "latest" for the most recent N periods. Results above ${preset.maxCells} cells are refused with advice on how to narrow the query.`,
      inputSchema: z.object({
        tableId,
        lang,
        selections: z
          .array(
            z.object({
              code: z
                .string()
                .describe('Variable code from get_table_metadata.'),
              values: z
                .array(z.string())
                .optional()
                .describe('Value codes to include.'),
              latest: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe(
                  'Include only the last N values. Use it for time variables, for example the latest 4 quarters.'
                )
            })
          )
          .describe(
            'One entry per variable to filter. Leave out variables you do not need.'
          )
      }),
      annotations: readAnnotations('Query table data')
    },
    async ({ tableId: id, lang: language = preset.languages[0], selections }) =>
      runTool(async () => {
        const metadata = await client.getMetadata(language, id);
        const plan = planQuery(metadata, selections, preset.maxCells);
        const table = await client.query(language, id, plan.selections);
        const header = `${table.label ?? metadata.title}. ${table.rows.length} rows.`;
        return textResult(
          `${header}\n\n${toCsv(table)}\n\n${sourceLine(language, id)}`
        );
      })
  );
}
