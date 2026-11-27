import { describe, expect, it, vi } from 'vitest';

import type { CrawlContext } from '@/crawl';
import { ibgeSource } from '@/ibge';

const ROOT = 'https://servicodados.ibge.gov.br/api/v3/agregados';

const CATALOGUE = [
  {
    id: 'IPCA',
    nome: 'Índice Nacional de Preços ao Consumidor Amplo',
    agregados: [
      { id: '1737', nome: 'IPCA - Série histórica' },
      { id: '1169', nome: 'Taxa de desocupação' }
    ]
  }
];

function siteFetch(): CrawlContext['fetch'] {
  return vi.fn<CrawlContext['fetch']>(async (input) => {
    const url = String(input);
    if (url === ROOT) return Response.json(CATALOGUE);
    if (url === `${ROOT}/1737/metadados`) {
      return Response.json({ periodicidade: { fim: 202610 } });
    }
    if (url === `${ROOT}/1169/metadados`) {
      return Response.json({ periodicidade: { fim: 2015 } });
    }
    return new Response('missing', { status: 404 });
  });
}

/** 101 tables; the metadata of the first `broken` ones fails. */
function manyTablesFetch(broken: number): CrawlContext['fetch'] {
  const ids = Array.from({ length: 101 }, (_, index) => String(index));
  return vi.fn<CrawlContext['fetch']>(async (input) => {
    const url = String(input);
    if (url === ROOT) {
      return Response.json([
        {
          id: 'G',
          nome: 'Group',
          agregados: ids.map((id) => ({ id, nome: `Table ${id}` }))
        }
      ]);
    }
    const id = /\/(\d+)\/metadados$/.exec(url)?.[1] ?? '';
    return Number(id) < broken
      ? new Response('error', { status: 500 })
      : Response.json({ periodicidade: { fim: 2026 } });
  });
}

function context(fetch: CrawlContext['fetch']): CrawlContext {
  return {
    fetch,
    userAgent: 'statsmcp-index/test',
    step: (_key, _schema, run) => run()
  };
}

describe('ibgeSource', () => {
  it('adds the last period of each table from its metadata', async () => {
    const docs = await ibgeSource(100).crawl('pt', context(siteFetch()));

    expect(docs.map((doc) => [doc.id, doc.lastPeriod, doc.path?.[0]])).toEqual([
      ['1737', '202610', 'Índice Nacional de Preços ao Consumidor Amplo'],
      ['1169', '2015', 'Índice Nacional de Preços ao Consumidor Amplo']
    ]);
  });

  it('keeps a table whose metadata fails, without a last period', async () => {
    const docs = await ibgeSource(100).crawl('pt', context(manyTablesFetch(1)));

    expect(docs.filter((doc) => !doc.lastPeriod).map((doc) => doc.id)).toEqual([
      '0'
    ]);
  });

  it('fails when more than 1% of the tables have no metadata', async () => {
    await expect(
      ibgeSource(100).crawl('pt', context(manyTablesFetch(2)))
    ).rejects.toThrow('no metadata for 2 of 101 tables');
  });
});
