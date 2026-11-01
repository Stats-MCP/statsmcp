import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openCheckpoint } from '@/checkpoint';

const HOUR = 60 * 60 * 1000;

async function checkpointFile(content?: string): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), 'statsmcp-cp-')), 'cp.json');
  if (content !== undefined) await writeFile(file, content);
  return file;
}

describe('openCheckpoint', () => {
  it('reuses saved steps in a new process', async () => {
    const file = await checkpointFile();
    const first = await openCheckpoint(file, { now: () => 0 });
    await first.step('a', z.number(), async () => 1);

    const second = await openCheckpoint(file, { now: () => HOUR });
    const value = await second.step('a', z.number(), async () => 2);

    expect(value).toBe(1);
    expect(second.discarded).toBeUndefined();
  });

  it.each([
    [
      'an old checkpoint',
      JSON.stringify({ startedAt: 0, steps: { a: 1 } }),
      'the checkpoint is older than its maximum age'
    ],
    ['a corrupt file', '{"startedAt":', 'the checkpoint file is not valid']
  ])('starts fresh from %s', async (_case, content, reason) => {
    const file = await checkpointFile(content);

    const checkpoint = await openCheckpoint(file, { now: () => 25 * HOUR });
    const value = await checkpoint.step('a', z.number(), async () => 2);

    expect(value).toBe(2);
    expect(checkpoint.discarded).toBe(reason);
  });

  it('runs a step again when its saved value no longer fits the schema', async () => {
    const file = await checkpointFile(
      JSON.stringify({ startedAt: 0, steps: { a: 'text' } })
    );

    const checkpoint = await openCheckpoint(file, { now: () => 0 });

    expect(await checkpoint.step('a', z.number(), async () => 3)).toBe(3);
  });
});
