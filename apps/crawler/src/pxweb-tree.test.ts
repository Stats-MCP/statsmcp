import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CrawlContext } from '@/crawl';
import { pxwebTreeSource } from '@/pxweb-tree';

import type { z } from 'zod';

const SITE: Record<string, unknown> = {
  '/api/v1/en': [
    { dbid: 'Cijene', text: 'Cijene' },
    { dbid: 'Popis 2003', text: 'Popis 2003' },
    { dbid: 'Stanovništvo', text: 'Stanovništvo' }
  ],
  '/api/v1/en/Cijene': [
    { id: 'Indeksi cijena', type: 'l', text: 'Price indices\n' },
    { id: 'CPI.px', type: 't', text: 'Prices overview', updated: '2026-10-01' }
  ],
  '/api/v1/en/Cijene/Indeksi%20cijena': [
    {
      id: 'CPI01.px',
      type: 't',
      text: 'Consumer price index\n',
      updated: '2026-10-15'
    },
    { id: 'Note', type: 'h', text: 'A heading' }
  ],
  '/api/v1/en/Stanovni%C5%A1tvo': [
    { id: 'POP1.px', type: 't', text: 'Population' }
  ]
};

let server: Server;
let baseUrl: string;
const paths: string[] = [];

beforeEach(async () => {
  paths.length = 0;
  server = createServer((request, response) => {
    const path = request.url ?? '/';
    paths.push(path);
    const body = SITE[path];
    response
      .writeHead(body ? 200 : 404, { 'content-type': 'application/json' })
      .end(body ? `﻿${JSON.stringify(body)}` : 'missing');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function context(): CrawlContext {
  return {
    fetch,
    userAgent: 'test',
    step: <T>(_key: string, _schema: z.ZodType<T>, run: () => Promise<T>) =>
      run()
  };
}

describe('pxwebTreeSource', () => {
  it('lists every table with multi-database ids and folder paths', async () => {
    const source = pxwebTreeSource({
      name: 'demo',
      roots: { en: baseUrl },
      skipDatabases: ['Popis 2003'],
      ratePerSecond: 100
    });

    const docs = await source.crawl('en', context());

    expect(docs).toEqual([
      {
        id: 'Cijene/CPI.px',
        title: 'Prices overview',
        path: ['Cijene'],
        updated: '2026-10-01'
      },
      {
        id: 'Cijene/Indeksi cijena/CPI01.px',
        title: 'Consumer price index',
        path: ['Cijene', 'Price indices'],
        updated: '2026-10-15'
      },
      {
        id: 'Stanovništvo/POP1.px',
        title: 'Population',
        path: ['Stanovništvo']
      }
    ]);
    expect(paths.some((path) => path.includes('Popis'))).toBe(false);
  });

  it('makes each folder a checkpoint step and reuses saved steps without a request', async () => {
    const saved = new Map<string, unknown>();
    const recording: CrawlContext = {
      fetch,
      userAgent: 'test',
      step: async <T>(
        key: string,
        schema: z.ZodType<T>,
        run: () => Promise<T>
      ) => {
        const hit = schema.safeParse(saved.get(key));
        if (hit.success) return hit.data;
        const value = await run();
        saved.set(key, value);
        return value;
      }
    };
    const source = pxwebTreeSource({
      name: 'demo',
      roots: { en: baseUrl },
      skipDatabases: ['Popis 2003'],
      ratePerSecond: 100
    });

    const first = await source.crawl('en', recording);
    paths.length = 0;
    const second = await source.crawl('en', recording);

    expect([...saved.keys()]).toEqual([
      'databases',
      'folder:Cijene',
      'folder:Cijene/Indeksi cijena',
      'folder:Stanovništvo'
    ]);
    expect(paths).toEqual([]);
    expect(second).toEqual(first);
  });

  it('lists a table once when two folders link to it', async () => {
    const folder = '/api/v1/en/Cijene/Indeksi%20cijena';
    const original = SITE[folder];
    SITE[folder] = [
      { id: 'CPI01.px', type: 't', text: 'Consumer price index' },
      { id: 'CPI01.px', type: 't', text: 'Consumer price index again' }
    ];
    const source = pxwebTreeSource({
      name: 'demo',
      roots: { en: baseUrl },
      skipDatabases: ['Popis 2003', 'Stanovništvo'],
      ratePerSecond: 100
    });

    const docs = await source.crawl('en', context()).finally(() => {
      SITE[folder] = original;
    });

    expect(docs.map((doc) => doc.title)).toEqual([
      'Prices overview',
      'Consumer price index'
    ]);
  });

  it('fails on an HTTP error instead of returning a partial list', async () => {
    // Only "Popis 2003" is left, and the fixture has no folder for it.
    const source = pxwebTreeSource({
      name: 'demo',
      roots: { en: baseUrl },
      skipDatabases: ['Cijene', 'Stanovništvo'],
      ratePerSecond: 100
    });

    await expect(source.crawl('en', context())).rejects.toThrow(
      'returned HTTP 404'
    );
  });

  it('stops a runaway walk at the folder limit', async () => {
    const source = pxwebTreeSource({
      name: 'demo',
      roots: { en: baseUrl },
      ratePerSecond: 100,
      skipDatabases: ['Popis 2003'],
      maxFolders: 2
    });

    await expect(source.crawl('en', context())).rejects.toThrow(
      'more than 2 folders'
    );
  });
});
