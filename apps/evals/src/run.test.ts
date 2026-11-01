import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CASES } from '@/dataset';
import {
  countRecordings,
  createRecordingFetch,
  type EvalMode
} from '@/recorder';
import { passRate, SCORER_NAMES, scoreCase, type Score } from '@/scorers';
import { manifest, PRESETS } from '@/servers';
import { PROVIDER_IDS, PROVIDERS, runCase, type ProviderId } from '@/task';

const provider: ProviderId =
  PROVIDER_IDS.find((id) => id === process.env.EVAL_PROVIDER) ?? 'anthropic';
/** Recordings and floors are per model; change the default together with both. */
const model = process.env.EVAL_MODEL ?? PROVIDERS[provider].model;
const mode: EvalMode = process.env.EVAL_MODE === 'record' ? 'record' : 'replay';
const recordingsDir = fileURLToPath(new URL('../recordings/', import.meta.url));
const floorsUrl = new URL('../floors.json', import.meta.url);
const floorsSchema = z.record(z.string(), z.record(z.string(), z.number()));

const hasRecordings = countRecordings(recordingsDir, model) > 0;
const canRun = mode === 'record' || hasRecordings;

if (!canRun) {
  console.error(
    `Agent evals skipped: no recordings for ${model}. Run EVAL_MODE=record to make them.`
  );
}

describe.skipIf(!canRun)(`agent evals (${model}, ${mode})`, () => {
  it('keeps every scorer at or above its floor', async () => {
    const { keyEnv } = PROVIDERS[provider];
    const apiKey = process.env[keyEnv] ?? 'replay';
    if (mode === 'record' && apiKey === 'replay') {
      throw new Error(`EVAL_MODE=record needs ${keyEnv}.`);
    }
    expect(CASES.length).toBeGreaterThan(0);
    const fetch = createRecordingFetch({ dir: recordingsDir, model, mode });
    const results: { id: string; tags: string[]; scores: Score[] }[] = [];
    for (const item of CASES) {
      const output = await runCase(item, await manifest(item.server), {
        provider,
        model,
        apiKey,
        fetch
      });
      const scores = scoreCase(item, output, PRESETS[item.server].languages[0]);
      results.push({ id: item.id, tags: item.tags, scores });
    }

    const byScorer = new Map<string, Score[]>();
    for (const result of results) {
      for (const score of result.scores) {
        byScorer.set(score.name, [...(byScorer.get(score.name) ?? []), score]);
      }
    }
    const rates = Object.fromEntries(
      [...byScorer].map(([name, scores]) => [name, passRate(scores)])
    );
    const failures = results.flatMap((result) =>
      result.scores
        .filter((score) => score.passed === false)
        .map((score) => `${result.id} ${score.name}: ${score.reason ?? ''}`)
    );
    console.error(JSON.stringify({ model, rates }, null, 2));
    if (failures.length) console.error(failures.join('\n'));

    const floors = existsSync(floorsUrl)
      ? floorsSchema.parse(JSON.parse(readFileSync(floorsUrl, 'utf8')))
      : {};
    if (process.env.UPDATE_FLOORS === '1') {
      writeFileSync(
        floorsUrl,
        `${JSON.stringify({ ...floors, [model]: rates }, null, 2)}\n`
      );
      return;
    }
    const floor = floors[model];
    if (!floor) {
      throw new Error(
        `No floors for ${model}. Run UPDATE_FLOORS=1 after recording.`
      );
    }
    expect(Object.keys(floor).toSorted()).toEqual(SCORER_NAMES.toSorted());
    const belowFloor = Object.entries(rates).filter(
      ([name, value]) => value < (floor[name] ?? 0)
    );
    expect(belowFloor).toEqual([]);
  }, 600_000);
});
