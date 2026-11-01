import { absPreset } from 'abs-mcp';
import { cbsPreset } from 'cbs-mcp';
import { dstPreset } from 'dst-mcp';
import {
  createMemoryCache,
  createPresetClient,
  type PxwebPreset
} from 'pxweb-mcp';
import { scbPreset } from 'scb-mcp';
import { eurostatPreset } from 'statsmcp-eurostat';
import { statcanPreset } from 'statsmcp-statcan';

import type { CrawlSource } from '@/crawl';
import { csoSource } from '@/cso';
import { pxwebTreeSource } from '@/pxweb-tree';

export function catalogueSource(
  preset: PxwebPreset,
  ratePerSecond: number
): CrawlSource {
  const cache = createMemoryCache();
  return {
    name: preset.name,
    langs: preset.languages,
    ratePerSecond,
    async crawl(lang, { fetch, userAgent }) {
      const client = createPresetClient(preset, {
        cache,
        fetch,
        userAgent
      });
      if (!client.listTables) {
        throw new Error(`${preset.name} cannot list its tables.`);
      }
      return client.listTables(lang);
    }
  };
}

// Each catalogue source downloads its whole list in one to a few requests. SCB
// allows 30 calls per 10 s, so half is 1.5 per second; the others publish no limit.
// Tree sources need one call per folder. Croatia allows 10 calls per 10 s (half:
// 0.5 per second). Iceland advertises 100 per 10 s but sent 429 at 2.7 per second.
// CSO publishes no limit; its whole collection is one request. ABS publishes no
// limit and lists all dataflows in one request.
export const SOURCES: readonly CrawlSource[] = [
  csoSource('https://ws.cso.ie/public'),
  catalogueSource(absPreset, 1),
  catalogueSource(cbsPreset, 1),
  catalogueSource(dstPreset, 1),
  catalogueSource(eurostatPreset, 1),
  catalogueSource(scbPreset, 1.5),
  catalogueSource(statcanPreset, 1),
  pxwebTreeSource({
    name: 'dzs',
    roots: {
      hr: 'https://web.dzs.hr/PXWeb/api/v1',
      en: 'https://web.dzs.hr/PXWeb/api/v1'
    },
    skipDatabases: ['Popis poljoprivrede 2003'],
    ratePerSecond: 0.5
  }),
  pxwebTreeSource({
    name: 'statice',
    roots: {
      is: 'https://px.hagstofa.is/pxis/api/v1',
      en: 'https://px.hagstofa.is/pxen/api/v1'
    },
    skipDatabases: ['Sogulegar'],
    ratePerSecond: 1
  })
];
