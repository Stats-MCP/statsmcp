import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readSnapshot, type Snapshot } from 'pxweb-mcp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CrawlError,
  crawlSource,
  type CrawlOptions,
  type CrawlSource
} from '@/crawl';

const TREE: Record<string, { id: string; title: string }[]> = {
  a: [
    { id: 'A1', title: 'Population by region' },
    { id: 'A2', title: 'Births' }
  ],
  b: [{ id: 'B1', title: 'Consumer price index' }],
  c: [{ id: 'C1', title: 'Employment' }]
};

interface Fixture {
  baseUrl: string;
  hits: string[];
  userAgents: Set<string>;
  failing: Set<string>;
  server: Server;
}

async function startFixture(): Promise<Fixture> {
  const hits: string[] = [];
  const userAgents = new Set<string>();
  const failing = new Set<string>();
  const server = createServer((request, response) => {
    const path = request.url ?? '/';
    hits.push(path);
    userAgents.add(request.headers['user-agent'] ?? '');
    const node = path.replace(/^\/node\//, '');
    if (failing.has(node)) {
      response.writeHead(500).end('down');
      return;
    }
    const body = path === '/root' ? Object.keys(TREE) : TREE[node];
    response
      .writeHead(body ? 200 : 404, { 'content-type': 'application/json' })
      .end(JSON.stringify(body ?? null));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('fixture server has no port');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    hits,
    userAgents,
    failing,
    server
  };
}

const tableSchema = z.array(z.object({ id: z.string(), title: z.string() }));

function treeSource(baseUrl: string): CrawlSource {
  return {
    name: 'demo',
    langs: ['en', 'de'],
    ratePerSecond: 1000,
    async crawl(_lang, { fetch, step }) {
      const nodes = await step('root', z.array(z.string()), async () =>
        z.array(z.string()).parse(await (await fetch(`${baseUrl}/root`)).json())
      );
      const docs = [];
      for (const node of nodes) {
        docs.push(
          ...(await step(`node:${node}`, tableSchema, async () => {
            const response = await fetch(`${baseUrl}/node/${node}`);
            if (!response.ok)
              throw new Error(`node ${node}: ${response.status}`);
            return tableSchema.parse(await response.json());
          }))
        );
      }
      return docs;
    }
  };
}

const previousOfTen = async (): Promise<Snapshot> => ({
  version: 1,
  source: 'demo',
  lang: 'en',
  builtAt: '2026-10-01T00:00:00.000Z',
  count: 10,
  docs: Array.from({ length: 10 }, (_, index) => ({
    id: `T${index}`,
    title: 'Old'
  }))
});

const unreadable = async (): Promise<Snapshot> => {
  throw new Error('Snapshot request returned HTTP 500.');
};

describe('crawlSource against a fixture server', () => {
  let fixture: Fixture;
  let dir: string;
  let options: CrawlOptions;

  beforeEach(async () => {
    fixture = await startFixture();
    dir = await mkdtemp(join(tmpdir(), 'statsmcp-crawl-'));
    options = {
      outDir: join(dir, 'out'),
      checkpointDir: join(dir, 'checkpoints'),
      userAgent: 'statsmcp-index/test (+https://statsmcp.dev)',
      previous: async () => undefined,
      langs: ['en'],
      sleep: async () => undefined,
      now: () => new Date('2026-11-01T00:00:00Z')
    };
  });

  afterEach(async () => {
    await new Promise((resolve) => fixture.server.close(resolve));
  });

  async function written(): Promise<Snapshot> {
    const bytes = await readFile(join(dir, 'out/index/demo/en.json.gz'));
    return readSnapshot(new Blob([bytes]).stream(), 'demo', 'en');
  }

  it('writes a valid gzip snapshot at the R2 key path with the crawler user agent', async () => {
    const results = await crawlSource(treeSource(fixture.baseUrl), options);

    expect(results).toEqual([
      expect.objectContaining({ source: 'demo', lang: 'en', count: 4 })
    ]);
    expect((await written()).docs.map((doc) => doc.id)).toEqual([
      'A1',
      'A2',
      'B1',
      'C1'
    ]);
    expect([...fixture.userAgents]).toEqual([
      'statsmcp-index/test (+https://statsmcp.dev)'
    ]);
    expect(existsSync(join(dir, 'checkpoints/demo-en.json'))).toBe(false);
  });

  it('resumes after a failure without fetching finished steps again', async () => {
    fixture.failing.add('b');
    await expect(
      crawlSource(treeSource(fixture.baseUrl), options)
    ).rejects.toThrow('demo/en: node b: 500');
    expect(existsSync(join(dir, 'checkpoints/demo-en.json'))).toBe(true);

    fixture.failing.clear();
    fixture.hits.length = 0;
    await crawlSource(treeSource(fixture.baseUrl), options);

    expect(fixture.hits).toEqual(['/node/b', '/node/c']);
    expect((await written()).count).toBe(4);
  });

  it('refuses a snapshot that lost too many tables unless forced', async () => {
    await expect(
      crawlSource(treeSource(fixture.baseUrl), {
        ...options,
        previous: previousOfTen
      })
    ).rejects.toThrow('table count fell from 10 to 4');
    expect(existsSync(join(dir, 'out/index/demo/en.json.gz'))).toBe(false);
    expect(existsSync(join(dir, 'checkpoints/demo-en.json'))).toBe(false);

    const forced = await crawlSource(treeSource(fixture.baseUrl), {
      ...options,
      previous: previousOfTen,
      force: true
    });
    expect(forced[0]).toMatchObject({ count: 4, previousCount: 10 });
  });

  it('stops before crawling when the previous snapshot cannot be read, unless forced', async () => {
    await expect(
      crawlSource(treeSource(fixture.baseUrl), {
        ...options,
        previous: unreadable
      })
    ).rejects.toThrow('HTTP 500');
    expect(fixture.hits).toEqual([]);

    const forced = await crawlSource(treeSource(fixture.baseUrl), {
      ...options,
      previous: unreadable,
      force: true
    });
    expect(forced[0]?.count).toBe(4);
  });

  it('crawls the other languages when one fails and reports the failure', async () => {
    const source = treeSource(fixture.baseUrl);
    const flaky: CrawlSource = {
      ...source,
      crawl: (lang, context) =>
        lang === 'de'
          ? Promise.reject(new Error('German list is down'))
          : source.crawl(lang, context)
    };

    const failure = await crawlSource(flaky, {
      ...options,
      langs: ['de', 'en', 'fr']
    }).catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(CrawlError);
    expect(failure).toMatchObject({
      results: [expect.objectContaining({ lang: 'en', count: 4 })],
      failures: [expect.objectContaining({ lang: 'de' })]
    });
  });
});
