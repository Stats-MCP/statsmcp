import { z } from 'zod';

import { toCsv } from '@/json-stat';
import { formatMetadata } from '@/metadata';
import type { PxwebPreset } from '@/preset';
import type { PxwebClient } from '@/pxweb-client';
import {
  DEFAULT_MAX_RESULT_CHARS,
  planQuery,
  QueryPlanError,
  type SelectionInput
} from '@/query-plan';
import { toolInput } from '@/tools/tool-input';
import { readAnnotations, runTool, textResult } from '@/tools/tool-result';

import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';

export const tableIdSchema = z
  .string()
  .min(1)
  .describe('Table id exactly as search_tables returns it.');

export const valueFilterSchema = z
  .string()
  .optional()
  .describe(
    'Show only values whose label contains this text, for example "Ljubljana".'
  );

export const selectionsSchema = z
  .array(
    z.object({
      code: z.string().describe('Variable code from get_table_metadata.'),
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
  );

export const METADATA_DESCRIPTION =
  'List the variables of a table and their value codes. Call this before query_table. Long value lists are shortened; use valueFilter to find specific values, for example a municipality name.';

export function queryTableDescription(maxCells: number): string {
  return `Get data from a table as CSV with readable labels. For each variable, give value codes from get_table_metadata, or "latest" for the most recent N periods. Results above ${maxCells} cells, or too large for the context, are refused with advice on how to narrow the query.`;
}

function sourceLine(preset: PxwebPreset, language: string, id: string): string {
  return `${preset.attribution(language)}, table ${id}: ${preset.tableUrl(language, id)}`;
}

export function getTableMetadata(
  client: PxwebClient,
  preset: PxwebPreset,
  args: { tableId: string; lang: string; valueFilter?: string | undefined }
): Promise<CallToolResult> {
  return runTool(async () => {
    const metadata = await client.getMetadata(args.lang, args.tableId);
    return textResult(
      `${formatMetadata(args.tableId, metadata, args.valueFilter)}\n\nOptional variables can be left out; the result then shows their total. Required variables left out return all their values.\n\n${sourceLine(preset, args.lang, args.tableId)}`
    );
  });
}

export function queryTable(
  client: PxwebClient,
  preset: PxwebPreset,
  args: { tableId: string; lang: string; selections: SelectionInput[] }
): Promise<CallToolResult> {
  return runTool(async () => {
    const metadata = await client.getMetadata(args.lang, args.tableId);
    const plan = planQuery(
      metadata,
      args.selections,
      preset.maxCells,
      preset.maxResultChars
    );
    const table = await client.query(args.lang, args.tableId, plan.selections);
    const csv = toCsv(table);
    const maxChars = preset.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
    if (table.rows.length > preset.maxCells) {
      throw new QueryPlanError(
        `The result has ${table.rows.length} rows, above the limit of ${preset.maxCells}. Select fewer values or use a smaller latest.`
      );
    }
    if (csv.length > maxChars) {
      throw new QueryPlanError(
        `The result has ${csv.length} characters, above the limit of ${maxChars}. Select fewer values or use a smaller latest.`
      );
    }
    const header = `${table.label ?? metadata.title}. ${table.rows.length} rows.`;
    return textResult(
      `${header}\n\n${csv}\n\n${sourceLine(preset, args.lang, args.tableId)}`
    );
  });
}

export function registerTableTools(
  server: McpServer,
  client: PxwebClient,
  preset: PxwebPreset
): void {
  const lang = z
    .enum(preset.languages)
    .optional()
    .describe(`Language of labels. Default "${preset.languages[0]}".`);

  server.registerTool(
    'get_table_metadata',
    {
      title: 'Get table variables',
      description: METADATA_DESCRIPTION,
      inputSchema: toolInput({
        tableId: tableIdSchema,
        lang,
        valueFilter: valueFilterSchema
      }),
      annotations: readAnnotations('Get table variables')
    },
    async ({ tableId, lang: language = preset.languages[0], valueFilter }) =>
      getTableMetadata(client, preset, { tableId, lang: language, valueFilter })
  );

  server.registerTool(
    'query_table',
    {
      title: 'Query table data',
      description: queryTableDescription(preset.maxCells),
      inputSchema: toolInput({
        tableId: tableIdSchema,
        lang,
        selections: selectionsSchema
      }),
      annotations: readAnnotations('Query table data')
    },
    async ({ tableId, lang: language = preset.languages[0], selections }) =>
      queryTable(client, preset, { tableId, lang: language, selections })
  );
}
