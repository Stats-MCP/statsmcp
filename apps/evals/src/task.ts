import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import {
  generateText,
  jsonSchema,
  tool,
  type LanguageModel,
  type ToolSet
} from 'ai';

import type { EvalCase } from '@/dataset';
import type { TaskOutput } from '@/scorers';
import type { Manifest } from '@/servers';

export type ProviderId = 'anthropic' | 'openai' | 'openrouter';

export const PROVIDER_IDS: readonly ProviderId[] = [
  'anthropic',
  'openai',
  'openrouter'
];

/** Anthropic is the default; recordings and floors are per model. */
export const PROVIDERS = {
  anthropic: { keyEnv: 'ANTHROPIC_API_KEY', model: 'claude-opus-5-5' },
  openai: { keyEnv: 'OPENAI_API_KEY', model: 'gpt-4.1-mini' },
  openrouter: { keyEnv: 'OPENROUTER_API_KEY', model: 'openai/gpt-4.1-mini' }
} as const satisfies Record<ProviderId, { keyEnv: string; model: string }>;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

function languageModel(options: {
  provider: ProviderId;
  model: string;
  apiKey: string;
  fetch: typeof fetch;
}): LanguageModel {
  const { apiKey, fetch } = options;
  if (options.provider === 'anthropic') {
    return createAnthropic({ apiKey, fetch })(options.model);
  }
  const baseURL =
    options.provider === 'openrouter' ? OPENROUTER_URL : undefined;
  return createOpenAI({ ...(baseURL ? { baseURL } : {}), apiKey, fetch }).chat(
    options.model
  );
}

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
  const result = await generateText({
    model: languageModel(options),
    system: manifest.instructions,
    prompt: item.ask,
    tools: asTools(manifest),
    toolChoice: 'auto',
    // Current Claude models reject sampling parameters with a 400.
    ...(options.provider === 'anthropic' ? {} : { temperature: 0 }),
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
