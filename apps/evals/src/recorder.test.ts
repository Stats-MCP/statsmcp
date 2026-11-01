import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { CASES } from '@/dataset';
import {
  countRecordings,
  createRecordingFetch,
  isProviderErrorBody,
  modelSlug,
  RecordingMissError,
  recordingKey
} from '@/recorder';
import { manifest } from '@/servers';
import { runCase } from '@/task';

const MODEL = 'test/model';

const completion = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 1,
  model: MODEL,
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search_tables',
              arguments: '{"query":"consumer price index","lang":"en"}'
            }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
};

const item = CASES.find((entry) => entry.id === 'au-inflation-en');

describe('record and replay', () => {
  it('records a provider answer once and replays it without the network', async () => {
    if (!item) throw new Error('missing case');
    const dir = mkdtempSync(join(tmpdir(), 'statsmcp-evals-'));
    const tools = await manifest(item.server);
    const provider = vi.fn<typeof fetch>(async () => Response.json(completion));
    const offline = vi.fn<typeof fetch>(async () => {
      throw new Error('network used in replay');
    });

    const recorded = await runCase(item, tools, {
      provider: 'openai',
      model: MODEL,
      apiKey: 'key',
      fetch: createRecordingFetch({
        dir,
        model: MODEL,
        mode: 'record',
        baseFetch: provider
      })
    });
    const replayed = await runCase(item, tools, {
      provider: 'openai',
      model: MODEL,
      apiKey: 'key',
      fetch: createRecordingFetch({
        dir,
        model: MODEL,
        mode: 'replay',
        baseFetch: offline
      })
    });

    expect(recorded).toEqual({
      toolName: 'search_tables',
      args: { query: 'consumer price index', lang: 'en' }
    });
    expect(replayed).toEqual(recorded);
    expect(provider).toHaveBeenCalledOnce();
    expect(offline).not.toHaveBeenCalled();
    expect(countRecordings(dir, MODEL)).toBe(1);
  });

  it('fails in replay when a recording is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'statsmcp-evals-'));
    const replay = createRecordingFetch({ dir, model: MODEL, mode: 'replay' });

    await expect(
      replay('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: MODEL, messages: [] })
      })
    ).rejects.toBeInstanceOf(RecordingMissError);
  });

  it('does not save a provider error that comes with HTTP 200', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'statsmcp-evals-'));
    const record = createRecordingFetch({
      dir,
      model: MODEL,
      mode: 'record',
      baseFetch: async () =>
        Response.json({ error: { message: 'upstream failed', code: 502 } })
    });

    await record('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: MODEL, messages: [] })
    });

    expect(countRecordings(dir, MODEL)).toBe(0);
  });

  it.each([
    ['an error object', { error: { message: 'x' } }, true],
    ['an error finish reason', { choices: [{ finish_reason: 'error' }] }, true],
    ['no choices', { choices: [] }, true],
    ['a normal answer', completion, false]
  ])('treats %s as a provider error: %s', (_name, body, expected) => {
    expect(isProviderErrorBody(JSON.stringify(body))).toBe(expected);
  });

  it('ignores a saved error answer: replay misses, record fetches again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'statsmcp-evals-'));
    const body = { model: MODEL, messages: [] };
    const folder = join(dir, modelSlug(MODEL));
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, `${recordingKey(body)}.json`),
      JSON.stringify({
        model: MODEL,
        requestBody: body,
        status: 200,
        contentType: 'application/json',
        responseBody: JSON.stringify({ error: { message: 'upstream failed' } })
      })
    );
    const request = {
      method: 'POST',
      body: JSON.stringify(body)
    };
    const provider = vi.fn<typeof fetch>(async () => Response.json(completion));

    expect(countRecordings(dir, MODEL)).toBe(0);
    await expect(
      createRecordingFetch({ dir, model: MODEL, mode: 'replay' })(
        'https://x',
        request
      )
    ).rejects.toBeInstanceOf(RecordingMissError);
    await createRecordingFetch({
      dir,
      model: MODEL,
      mode: 'record',
      baseFetch: provider
    })('https://x', request);

    expect(provider).toHaveBeenCalledOnce();
    expect(countRecordings(dir, MODEL)).toBe(1);
  });
});
