import { describe, expect, it, vi } from 'vitest';

import { createPxwebClient, isValidTableId, PxwebError } from '@/pxweb-client';

const BASE_URL = 'https://stats.example/api/v1';

const metadataBody = JSON.stringify({
  title: 'Population',
  variables: [
    {
      code: 'SPOL',
      text: 'SEX',
      values: ['1'],
      valueTexts: ['Men'],
      elimination: true
    }
  ]
});

describe('isValidTableId', () => {
  it.each([
    ['0156101S.px', true],
    ['folder/sub/05A1002S.px', true],
    ['../secret.px', false],
    ['05A1002S', false],
    ['/05A1002S.px', false],
    ['a/../b.px', false],
    ['05A1002S.px?x=1', false]
  ])('%s → %s', (tableId, valid) => {
    expect(isValidTableId(tableId)).toBe(valid);
  });
});

describe('createPxwebClient', () => {
  it('serves repeated metadata requests from the cache', async () => {
    const fetchMock = vi.fn(async () => new Response(metadataBody));
    const client = createPxwebClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await client.getMetadata('en', 'T1.px');
    const metadata = await client.getMetadata('en', 'T1.px');
    await client.getMetadata('sl', 'T1.px');

    expect(metadata.variables[0]).toMatchObject({
      code: 'SPOL',
      eliminable: true,
      isTime: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a response with an unexpected shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"unexpected":true}'))
      .mockResolvedValueOnce(new Response(metadataBody));
    const client = createPxwebClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await expect(client.getMetadata('en', 'T1.px')).rejects.toBeInstanceOf(
      PxwebError
    );
    await expect(client.getMetadata('en', 'T1.px')).resolves.toMatchObject({
      title: 'Population'
    });
  });

  it('reports upstream HTTP errors with their status', async () => {
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      fetch: async () => new Response('Too many', { status: 429 })
    });

    await expect(client.search('en', 'x')).rejects.toMatchObject({
      status: 429
    });
  });
});
