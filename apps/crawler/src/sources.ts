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

// Each source downloads its whole catalogue in one to a few requests. SCB allows
// 30 calls per 10 s, so half is 1.5 per second; the others publish no limit.
export const SOURCES: readonly CrawlSource[] = [
  catalogueSource(cbsPreset, 1),
  catalogueSource(dstPreset, 1),
  catalogueSource(eurostatPreset, 1),
  catalogueSource(scbPreset, 1.5),
  catalogueSource(statcanPreset, 1)
];
