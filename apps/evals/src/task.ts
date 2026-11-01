import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema, tool, type ToolSet } from 'ai';

import type { EvalCase } from '@/dataset';
import type { TaskOutput } from '@/scorers';
import type { Manifest } from '@/servers';

export type ProviderId = 'openai' | 'openrouter';

/** OpenAI is the default; OpenRouter gives access to other model families. */
export const PROVIDERS = {
  openai: {
    baseURL: undefined,
    keyEnv: 'OPENAI_API_KEY',
    model: 'gpt-4.1-mini'
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    model: 'openai/gpt-4.1-mini'
  }
} as const satisfies Record<
  ProviderId,
  { baseURL: string | undefined; keyEnv: string; model: string }
>;

function asTools(manifest: Manifest): ToolSet {
  return Object.fromEntries(
    manifest.tools.map((def) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: jsonSchema(def.inputSchema)
      })
    ])
  );
}

/** One model turn: the real server instructions and tools, the user's question, no tool results. */
export async function runCase(
  item: EvalCase,
  manifest: Manifest,
  options: {
    provider: ProviderId;
    model: string;
    apiKey: string;
    fetch: typeof fetch;
  }
): Promise<TaskOutput> {
  const { baseURL } = PROVIDERS[options.provider];
  const provider = createOpenAI({
    ...(baseURL ? { baseURL } : {}),
    apiKey: options.apiKey,
    fetch: options.fetch
  });
  const result = await generateText({
    model: provider.chat(options.model),
    system: manifest.instructions,
    prompt: item.ask,
    tools: asTools(manifest),
    toolChoice: 'auto',
    temperature: 0,
    maxRetries: 0
  });
  const call = result.toolCalls[0];
  const input: unknown = call?.input;
  return {
    toolName: call?.toolName ?? null,
    args:
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? Object.fromEntries(Object.entries(input))
        : null
  };
}
