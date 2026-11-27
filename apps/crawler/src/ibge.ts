import {
  createMemoryCache,
  createPresetClient,
  type TableDoc
} from '@statsmcp/core';
import { ibgePreset } from '@statsmcp/ibge';
import { z } from 'zod';

import type { CrawlContext, CrawlSource } from '@/crawl';

const CHUNK_SIZE = 50;
/** A few aggregates have broken metadata; more than this share means IBGE has a problem. */
const MAX_MISSING_SHARE = 0.01;

const metadataSchema = z.object({
  periodicidade: z.object({ fim: z.union([z.number(), z.string()]) })
});
const endsSchema = z.record(z.string(), z.string().nullable());

async function readEnd(
  fetch: CrawlContext['fetch'],
  url: string
): Promise<string | null> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const text = await response.text();
  try {
    return String(metadataSchema.parse(JSON.parse(text)).periodicidade.fim);
  } catch (err) {
    throw new Error(`${url} returned an unexpected body.`, { cause: err });
  }
}

/**
 * The IBGE catalogue has no dates, so the crawl reads the last period of each
 * aggregate from its metadata (one small request per table). Search then ranks
 * tables with current data above ended series.
 */
export function ibgeSource(ratePerSecond: number): CrawlSource {
  const cache = createMemoryCache();
  return {
    name: ibgePreset.name,
    langs: ibgePreset.languages,
    ratePerSecond,
    async crawl(lang, { fetch, userAgent, step }) {
      const client = createPresetClient(ibgePreset, {
        cache,
        fetch,
        userAgent
      });
      if (!client.listTables) throw new Error('IBGE cannot list its tables.');
      const docs = await client.listTables(lang);
      const ends = new Map<string, string | null>();
      for (let start = 0; start < docs.length; start += CHUNK_SIZE) {
        const chunk = docs.slice(start, start + CHUNK_SIZE);
        const found = await step(`ends:${start}`, endsSchema, async () =>
          Object.fromEntries(
            await Promise.all(
              chunk.map(
                async (doc) =>
                  [
                    doc.id,
                    await readEnd(
                      fetch,
                      `${ibgePreset.apiBaseUrl}/${encodeURIComponent(doc.id)}/metadados`
                    )
                  ] as const
              )
            )
          )
        );
        for (const [id, end] of Object.entries(found)) ends.set(id, end);
      }
      const missing = docs.filter((doc) => !ends.get(doc.id)).length;
      if (missing > docs.length * MAX_MISSING_SHARE) {
        throw new Error(
          `IBGE: no metadata for ${missing} of ${docs.length} tables.`
        );
      }
      return docs.map((doc): TableDoc => {
        const end = ends.get(doc.id);
        return end ? { ...doc, lastPeriod: end } : doc;
      });
    }
  };
}
