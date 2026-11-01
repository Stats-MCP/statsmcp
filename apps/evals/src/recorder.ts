import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

export type EvalMode = 'replay' | 'record';

const recordingSchema = z.object({
  model: z.string(),
  requestBody: z.unknown(),
  status: z.number(),
  contentType: z.string(),
  responseBody: z.string()
});

export class RecordingMissError extends Error {
  constructor(readonly path: string) {
    super(
      `No recording at ${path}. Run EVAL_MODE=record with an API key to make it.`
    );
    this.name = 'RecordingMissError';
  }
}

/** Sorted keys, so the same request always gives the same file name. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, canonicalize(inner)])
    );
  }
  return value;
}

export function modelSlug(model: string): string {
  return model
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function recordingKey(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(body)))
    .digest('hex');
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

function isErrorReason(reason: unknown): boolean {
  return typeof reason === 'string' && reason.toLowerCase() === 'error';
}

/**
 * Providers can answer HTTP 200 with an error inside the body (OpenRouter when an
 * upstream fails). Accepts Anthropic messages and OpenAI chat completions. Such answers must never become recordings.
 */
export function isProviderErrorBody(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return true;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return true;
  }
  if (field(parsed, 'error') != null) return true;
  if (field(parsed, 'type') === 'message') {
    const stop = field(parsed, 'stop_reason');
    return (
      !Array.isArray(field(parsed, 'content')) ||
      stop === 'refusal' ||
      stop === 'max_tokens'
    );
  }
  const choices = field(parsed, 'choices');
  if (!Array.isArray(choices) || choices.length === 0) return true;
  return choices.some(
    (choice) =>
      field(choice, 'error') != null ||
      isErrorReason(field(choice, 'finish_reason')) ||
      isErrorReason(field(choice, 'native_finish_reason'))
  );
}

function readRecording(path: string): z.infer<typeof recordingSchema> | null {
  try {
    const file = recordingSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    return isProviderErrorBody(file.responseBody) ? null : file;
  } catch {
    return null;
  }
}

export function countRecordings(dir: string, model: string): number {
  const folder = join(dir, modelSlug(model));
  if (!existsSync(folder)) return 0;
  return readdirSync(folder)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => readRecording(join(folder, file)) !== null).length;
}

function requestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== 'string') {
    throw new Error('The recorder supports only string request bodies.');
  }
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

/**
 * A fetch for the model provider. "replay" answers from saved responses and never
 * calls the network; "record" calls the provider and saves each good answer.
 */
export function createRecordingFetch(options: {
  dir: string;
  model: string;
  mode: EvalMode;
  baseFetch?: typeof fetch;
}): typeof fetch {
  const baseFetch = options.baseFetch ?? globalThis.fetch;
  const folder = join(options.dir, modelSlug(options.model));

  return async (input, init) => {
    const body = requestBody(init);
    const path = join(folder, `${recordingKey(body)}.json`);

    const file = existsSync(path) ? readRecording(path) : null;
    if (file) {
      return new Response(file.responseBody, {
        status: file.status,
        headers: { 'content-type': file.contentType }
      });
    }
    if (options.mode === 'replay') throw new RecordingMissError(path);

    const response = await baseFetch(input, init);
    const responseBody = await response.text();
    const contentType =
      response.headers.get('content-type') ?? 'application/json';
    if (response.ok && !isProviderErrorBody(responseBody)) {
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        path,
        `${JSON.stringify(
          {
            model: options.model,
            requestBody: body,
            status: response.status,
            contentType,
            responseBody
          },
          null,
          2
        )}\n`
      );
    }
    return new Response(responseBody, {
      status: response.status,
      headers: { 'content-type': contentType }
    });
  };
}
