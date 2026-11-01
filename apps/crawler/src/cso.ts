import { z } from 'zod';

import type { CrawlSource } from '@/crawl';

import type { TableDoc } from 'pxweb-mcp';

const MAX_COLLECTION_BYTES = 100 * 1024 * 1024;

const itemSchema = z.object({
  label: z.string(),
  updated: z.string().optional(),
  id: z.array(z.string()),
  extension: z.object({ matrix: z.string() }),
  role: z.object({ time: z.array(z.string()).optional() }).optional(),
  dimension: z.record(
    z.string(),
    z.object({
      label: z.string().optional(),
      category: z
        .object({
          index: z.array(z.string()).optional(),
          label: z.record(z.string(), z.string()).optional()
        })
        .optional()
    })
  )
});
const collectionSchema = z.object({
  result: z.object({ link: z.object({ item: z.array(itemSchema) }) })
});

type CollectionItem = z.infer<typeof itemSchema>;

/**
 * Many CSO tables share one short label ("Consumer Price Index"), so the title
 * adds the other dimensions and the period range.
 */
function toDoc(item: CollectionItem): TableDoc {
  const timeCode = item.role?.time?.[0];
  const time = timeCode ? item.dimension[timeCode]?.category : undefined;
  const labels = time?.label ?? {};
  const periods = (time?.index ?? Object.keys(labels))
    .toSorted()
    .map((code) => labels[code] ?? code);
  const others = item.id
    .filter((code) => code !== timeCode && code !== 'STATISTIC')
    .map((code) => item.dimension[code]?.label ?? code);
  const first = periods[0];
  const last = periods.at(-1);
  const by = others.length > 0 ? ` by ${others.join(', ')}` : '';
  const range = first && last ? ` (${first} – ${last})` : '';
  return {
    id: item.extension.matrix,
    title: `${item.label}${by}${range}`,
    ...(item.updated ? { updated: item.updated } : {}),
    ...(last ? { lastPeriod: last } : {})
  };
}

const lastYear = (doc: TableDoc): number =>
  Number(/(\d{4})/.exec(doc.lastPeriod ?? '')?.[1] ?? 0);

/**
 * The index trusts catalogue order (offices list main tables first), but the CSO
 * collection has no meaningful order, so tables with the newest data go first.
 */
function newestFirst(docs: readonly TableDoc[]): TableDoc[] {
  return docs.toSorted(
    (a, b) => lastYear(b) - lastYear(a) || a.id.localeCompare(b.id)
  );
}

export function csoSource(root: string): CrawlSource {
  return {
    name: 'cso',
    langs: ['en'],
    ratePerSecond: 1,
    async crawl(lang, { fetch }) {
      const response = await fetch(`${root}/api.jsonrpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'PxStat.Data.Cube_API.ReadCollection',
          params: { language: lang },
          id: 1
        })
      });
      const size = Number(response.headers.get('content-length') ?? 0);
      if (!response.ok || size > MAX_COLLECTION_BYTES) {
        await response.body?.cancel();
        throw new Error(
          response.ok
            ? `CSO ReadCollection is too large (${size} bytes).`
            : `CSO ReadCollection returned HTTP ${response.status}.`
        );
      }
      const { result } = collectionSchema.parse(await response.json());
      return newestFirst(result.link.item.map(toDoc));
    }
  };
}
