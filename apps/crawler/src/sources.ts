import { absPreset } from '@statsmcp/abs';
import { cbsPreset } from '@statsmcp/cbs';
import {
  createIneEsClient,
  createInePtClient,
  createInseeClient,
  createMemoryCache,
  createPresetClient,
  PxwebError,
  type PxwebPreset
} from '@statsmcp/core';
import { dstPreset } from '@statsmcp/dst';
import { eurostatPreset } from '@statsmcp/eurostat';
import { scbPreset } from '@statsmcp/scb';
import { statcanPreset } from '@statsmcp/statcan';
import { statecPreset } from '@statsmcp/statec';

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

const INE_TIMEOUT_MS = 60_000;

/** One request per INE operation (166); some take 20 s, so the timeout is longer. */
export function ineEsSource(baseUrl: string): CrawlSource {
  return {
    name: 'ine-es',
    langs: ['es', 'en'],
    ratePerSecond: 1,
    async crawl(lang, { fetch, userAgent }) {
      return createIneEsClient({
        baseUrl,
        fetch,
        userAgent,
        timeoutMs: INE_TIMEOUT_MS
      }).listTables(lang);
    }
  };
}

const CATALOGUE_ATTEMPTS = 3;

export function inePtSource(baseUrl: string): CrawlSource {
  return {
    name: 'ine-pt',
    langs: ['pt', 'en'],
    ratePerSecond: 1,
    // Each catalogue is about 21 MB; downloads have taken from 30 s to more than 120 s.
    timeoutMs: 300_000,
    async crawl(lang, { fetch, userAgent }) {
      const client = createInePtClient({ baseUrl, fetch, userAgent });
      // The server sometimes closes the download early; the client then refuses it with 502.
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await client.listTables(lang);
        } catch (err) {
          const retry = err instanceof PxwebError && err.status === 502;
          if (!retry || attempt >= CATALOGUE_ATTEMPTS) throw err;
        }
      }
    }
  };
}

/** The whole catalogue is one 1.5 MB request; both languages share its cached body. */
export function inseeSource(baseUrl: string): CrawlSource {
  const cache = createMemoryCache();
  return {
    name: 'insee',
    langs: ['fr', 'en'],
    ratePerSecond: 0.25,
    async crawl(lang, { fetch, userAgent }) {
      return createInseeClient({ baseUrl, cache, fetch, userAgent }).listTables(
        lang
      );
    }
  };
}

// Each catalogue source downloads its whole list in one to a few requests. SCB
// allows 30 calls per 10 s, so half is 1.5 per second; the others publish no limit.
// Tree sources need one call per folder. Croatia and Moldova allow 10 calls per
// 10 s (half: 0.5 per second). Iceland advertises 100 per 10 s but sent 429 at 2.7 per second.
// CSO publishes no limit; its whole collection is one request. ABS publishes no
// limit and lists all dataflows in one request. INE Spain publishes no limit.
// INE Portugal recommends at most 15–20 requests per second; its whole catalogue
// is one request per language.
// INSEE Melodi allows 30 calls per minute (half: 0.25 per second).
export const SOURCES: readonly CrawlSource[] = [
  csoSource('https://ws.cso.ie/public'),
  ineEsSource('https://servicios.ine.es/wstempus/js'),
  inseeSource('https://api.insee.fr/melodi'),
  catalogueSource(absPreset, 1),
  catalogueSource(cbsPreset, 1),
  catalogueSource(dstPreset, 1),
  catalogueSource(eurostatPreset, 1),
  catalogueSource(scbPreset, 1.5),
  catalogueSource(statcanPreset, 1),
  catalogueSource(statecPreset, 1),
  inePtSource('https://www.ine.pt/ine'),
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
  }),
  pxwebTreeSource({
    name: 'bns',
    roots: {
      ro: 'https://statbank.statistica.md/PxWeb/api/v1',
      en: 'https://statbank.statistica.md/PxWeb/api/v1'
    },
    // ssd is listed only in English and answers every request with "Parameter error".
    skipDatabases: ['ssd'],
    ratePerSecond: 0.5
  })
];
