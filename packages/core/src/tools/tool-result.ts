import { PxwebError } from '@/pxweb-client';
import { QueryPlanError } from '@/query-plan';

import type {
  CallToolResult,
  ToolAnnotations
} from '@modelcontextprotocol/server';

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function readAnnotations(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
}

export async function runTool(
  handler: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof QueryPlanError) return toolError(err.message);
    if (err instanceof PxwebError) {
      if (err.status === 429) {
        return toolError(
          'The statistics API is rate limiting requests. Wait a few seconds and try again.'
        );
      }
      return toolError(err.message);
    }
    console.error('Unexpected tool error', err);
    return toolError('Unexpected error while reading statistics data.');
  }
}
