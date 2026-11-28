import { bdlPreset } from '@statsmcp/bdl';
import {
  createMemoryCache,
  createPresetClient,
  type TableDoc
} from '@statsmcp/core';
import { z } from 'zod';

import type { CrawlContext, CrawlSource } from '@/crawl';

const CHUNK_SIZE = 50;
const MAX_MISSING_SHARE = 0.01;

const subjectSchema = z.object({ years: z.array(z.number()).default([]) });
const yearsSchema = z.record(z.string(), z.string().nullable());

async function readLastYear(
  fetch: CrawlContext['fetch'],
  url: string,
  clientId: string
): Promise<string | null> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'x-clientid': clientId }
  });
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new Error(
      `BDL refused the API key (HTTP ${response.status}). Check BDL_CLIENT_ID.`
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const text = await response.text();
  let years: number[];
  try {
    years = subjectSchema.parse(JSON.parse(text)).years;
  } catch (err) {
    throw new Error(`${url} returned an unexpected body.`, { cause: err });
  }
  return years.length > 0 ? String(Math.max(...years)) : null;
}

/**
 * The BDL subject lists have no years; only `subjects/{id}` has them, one
 * request per subject. That needs the API key (the anonymous limit is 1,000
 * requests per 12 hours), and both languages share the years read once.
 */
export function bdlSource(
  ratePerSecond: number,
  clientId: string | undefined
): CrawlSource {
  const cache = createMemoryCache();
  const lastYears = new Map<string, string | null>();
  return {
    name: bdlPreset.name,
    langs: bdlPreset.languages,
    ratePerSecond,
    async crawl(lang, { fetch, userAgent, step, log }) {
      const client = createPresetClient(bdlPreset, {
        cache,
        fetch,
        userAgent,
        ...(clientId && { clientId })
      });
      if (!client.listTables) throw new Error('BDL cannot list its tables.');
      const docs = await client.listTables(lang);
      if (!clientId) {
        log?.('bdl: no BDL_CLIENT_ID, so the subjects get no last year.');
        return docs;
      }
      const unread = docs.filter((doc) => !lastYears.has(doc.id));
      for (let start = 0; start < unread.length; start += CHUNK_SIZE) {
        const chunk = unread.slice(start, start + CHUNK_SIZE);
        const found = await step(
          `years:${chunk[0]?.id ?? start}`,
          yearsSchema,
          async () =>
            Object.fromEntries(
              await Promise.all(
                chunk.map(
                  async (doc) =>
                    [
                      doc.id,
                      await readLastYear(
                        fetch,
                        `${bdlPreset.apiBaseUrl}/subjects/${encodeURIComponent(doc.id)}?format=json`,
                        clientId
                      )
                    ] as const
                )
              )
            )
        );
        for (const [id, year] of Object.entries(found)) lastYears.set(id, year);
      }
      const missing = docs.filter((doc) => !lastYears.get(doc.id)).length;
      if (missing > docs.length * MAX_MISSING_SHARE) {
        throw new Error(
          `BDL: no years for ${missing} of ${docs.length} subjects.`
        );
      }
      return docs.map((doc): TableDoc => {
        const year = lastYears.get(doc.id);
        return year ? { ...doc, lastPeriod: year } : doc;
      });
    }
  };
}
