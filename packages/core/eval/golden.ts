import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { z } from 'zod';

import { tableDocSchema, type TableDoc } from '@/table-doc';

const snapshotSchema = z.object({
  source: z.string(),
  lang: z.string(),
  docs: z.array(tableDocSchema)
});

const goldenSchema = z.object({
  source: z.string(),
  lang: z.string(),
  queries: z.array(
    z.object({ query: z.string(), relevant: z.record(z.string(), z.number()) })
  )
});

export type EvalDoc = TableDoc;
export type GoldenSet = z.infer<typeof goldenSchema>;

const root = new URL('./', import.meta.url);

export function loadGoldenSets(): GoldenSet[] {
  return readdirSync(new URL('golden/', root))
    .filter((file) => file.endsWith('.json'))
    .toSorted()
    .map((file) =>
      goldenSchema.parse(
        JSON.parse(readFileSync(new URL(`golden/${file}`, root), 'utf8'))
      )
    );
}

export function loadDocs(source: string, lang: string): EvalDoc[] {
  const raw = gunzipSync(
    readFileSync(new URL(`fixtures/${source}-${lang}.json.gz`, root))
  );
  return snapshotSchema.parse(JSON.parse(raw.toString('utf8'))).docs;
}
