import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { z } from 'zod';

export interface Checkpoint {
  step<T>(key: string, schema: z.ZodType<T>, run: () => Promise<T>): Promise<T>;
  readonly size: number;
  /** Why an existing checkpoint file was not used, if it was not. */
  readonly discarded?: string;
  clear(): Promise<void>;
}

export interface CheckpointOptions {
  maxAgeMs?: number;
  now?: () => number;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const fileSchema = z.object({
  startedAt: z.number(),
  steps: z.record(z.string(), z.unknown())
});
type CheckpointFile = z.infer<typeof fileSchema>;

async function readCheckpointFile(
  file: string
): Promise<{ data?: CheckpointFile; problem?: string }> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
  try {
    return { data: fileSchema.parse(JSON.parse(text)) };
  } catch {
    return { problem: 'the checkpoint file is not valid' };
  }
}

export async function openCheckpoint(
  file: string,
  options: CheckpointOptions = {}
): Promise<Checkpoint> {
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const existing = await readCheckpointFile(file);
  let discarded = existing.problem;
  let state: CheckpointFile = { startedAt: now(), steps: {} };
  if (existing.data && now() - existing.data.startedAt > maxAgeMs) {
    discarded = 'the checkpoint is older than its maximum age';
  } else if (existing.data) {
    state = existing.data;
  }
  let saving = Promise.resolve();

  function save(): Promise<void> {
    const next = saving.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(state));
      await rename(`${file}.tmp`, file);
    });
    saving = next.catch(() => undefined);
    return next;
  }

  return {
    async step(key, schema, run) {
      const saved = schema.safeParse(state.steps[key]);
      if (key in state.steps && saved.success) return saved.data;
      const value = await run();
      state.steps[key] = value;
      await save();
      return value;
    },
    get size() {
      return Object.keys(state.steps).length;
    },
    ...(discarded ? { discarded } : {}),
    async clear() {
      await saving;
      await rm(file, { force: true });
    }
  };
}
