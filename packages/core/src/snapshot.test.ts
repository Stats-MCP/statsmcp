import { describe, expect, it, vi } from 'vitest';

import {
  bucketSnapshotReader,
  firstSnapshot,
  readSnapshot,
  snapshotKey,
  urlSnapshotReader,
  writeSnapshot,
  type Snapshot
} from '@/snapshot';

const snapshot: Snapshot = {
  version: 1,
  source: 'hagstofa',
  lang: 'en',
  builtAt: '2026-11-01T04:00:00Z',
  count: 2,
  docs: [
    {
      id: 'Ibuar/mannfjoldi/MAN00101.px',
      title: 'Population by sex and age 1841-2026',
      path: ['Population'],
      updated: '2026-03-12'
    },
    {
      id: 'Ibuar/mannfjoldi/MAN02120.px',
      title: 'Population by municipalities 1901-1990',
      discontinued: true
    }
  ]
};

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function writeRaw(value: unknown): Promise<Uint8Array<ArrayBuffer>> {
  return gzip(JSON.stringify(value));
}

function streamOf(
  bytes: Uint8Array<ArrayBuffer>
): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new Blob([bytes]).stream();
}

describe('snapshots', () => {
  it('round-trips a gzip snapshot and checks source and language', async () => {
    const bytes = await writeSnapshot(snapshot);

    await expect(
      readSnapshot(streamOf(bytes), 'hagstofa', 'en')
    ).resolves.toEqual(snapshot);
    await expect(
      readSnapshot(streamOf(bytes), 'hagstofa', 'is')
    ).rejects.toThrow('not hagstofa/is');
  });

  it('reads a snapshot that the host already decompressed', async () => {
    const plain = new TextEncoder().encode(JSON.stringify(snapshot));

    await expect(
      readSnapshot(streamOf(plain), 'hagstofa', 'en')
    ).resolves.toEqual(snapshot);
  });

  it.each([
    [
      'a newer format version',
      async () => writeRaw({ ...snapshot, version: 2 }),
      'Invalid input'
    ],
    ['a body that is not JSON', async () => gzip('not json'), 'JSON'],
    [
      'a body that is too large',
      async () => gzip(' '.repeat(21 * 1024 * 1024)),
      'too large'
    ]
  ])('rejects %s', async (_case, make, message) => {
    await expect(
      readSnapshot(streamOf(await make()), 'hagstofa', 'en')
    ).rejects.toThrow(message);
  });

  it.each([
    ['..', 'en'],
    ['hagstofa', 'en/../x']
  ])('refuses the key parts %s and %s', (source, lang) => {
    expect(() => snapshotKey(source, lang)).toThrow('Invalid snapshot source');
  });

  it('rejects a snapshot whose count does not match its tables', async () => {
    await expect(writeSnapshot({ ...snapshot, count: 3 })).rejects.toThrow(
      'count does not match'
    );
  });

  it('reads from a URL and treats 404 as no snapshot', async () => {
    const bytes = await writeSnapshot(snapshot);
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith(snapshotKey('hagstofa', 'en'))
        ? new Response(bytes)
        : new Response('', { status: 404 })
    );
    const read = urlSnapshotReader('https://statsmcp.example/', {
      fetch: fetchMock
    });

    await expect(read('hagstofa', 'en')).resolves.toMatchObject({ count: 2 });
    await expect(read('hagstofa', 'is')).resolves.toBeUndefined();
    const failing = urlSnapshotReader('https://statsmcp.example', {
      fetch: async () => new Response('down', { status: 500 })
    });
    await expect(failing('hagstofa', 'en')).rejects.toThrow('HTTP 500');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://statsmcp.example/index/hagstofa/en.json.gz'
    );
  });

  it('reads from an R2 bucket and falls through broken or empty readers', async () => {
    const bytes = await writeSnapshot(snapshot);
    const bucket = {
      get: async (key: string) =>
        key === snapshotKey('hagstofa', 'en') ? { body: streamOf(bytes) } : null
    };
    const broken = vi.fn<
      (source: string, lang: string) => Promise<Snapshot | undefined>
    >(async () => {
      throw new Error('mirror down');
    });
    const errors: number[] = [];
    const read = firstSnapshot([broken, bucketSnapshotReader(bucket)], {
      onError: (_error, reader) => errors.push(reader)
    });

    await expect(read('hagstofa', 'en')).resolves.toMatchObject({
      source: 'hagstofa'
    });
    await expect(read('hagstofa', 'is')).resolves.toBeUndefined();
    expect(broken).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([0, 0]);
  });
});
