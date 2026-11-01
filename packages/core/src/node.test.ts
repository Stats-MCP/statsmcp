import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { nodeTableSnapshots } from '@/node';
import { writeSnapshot, type Snapshot } from '@/snapshot';

function snapshot(id: string): Snapshot {
  return {
    version: 1,
    source: 'dst',
    lang: 'en',
    builtAt: '2026-11-01T00:00:00.000Z',
    count: 1,
    docs: [{ id, title: `Table ${id}` }]
  };
}

async function bundledDir(): Promise<URL> {
  const dir = await mkdtemp(join(tmpdir(), 'statsmcp-snap-'));
  await writeFile(
    join(dir, 'en.json.gz'),
    await writeSnapshot(snapshot('BUNDLED'))
  );
  return pathToFileURL(`${dir}/`);
}

async function firstDocId(
  read: ReturnType<typeof nodeTableSnapshots>,
  lang = 'en'
): Promise<string | undefined> {
  return (await read('dst', lang))?.docs[0]?.id;
}

describe('nodeTableSnapshots', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads statsmcp.dev first', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(await writeSnapshot(snapshot('REMOTE')))
    );
    vi.stubGlobal('fetch', fetchMock);

    const read = nodeTableSnapshots(await bundledDir(), { env: {} });

    expect(await firstDocId(read)).toBe('REMOTE');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://statsmcp.dev/index/dst/en.json.gz'
    );
  });

  it('falls back to the bundled snapshot when statsmcp.dev has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response('', { status: 404 }))
    );

    const read = nodeTableSnapshots(await bundledDir(), { env: {} });

    expect(await firstDocId(read)).toBe('BUNDLED');
    expect(await firstDocId(read, 'da')).toBeUndefined();
  });

  it('makes no network request with STATSMCP_INDEX=off', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    const read = nodeTableSnapshots(await bundledDir(), {
      env: { STATSMCP_INDEX: 'off' }
    });

    expect(await firstDocId(read)).toBe('BUNDLED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a corrupt bundled snapshot and treats it as missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'statsmcp-snap-'));
    await writeFile(join(dir, 'en.json.gz'), 'not gzip');
    const messages: string[] = [];

    const read = nodeTableSnapshots(pathToFileURL(`${dir}/`), {
      env: { STATSMCP_INDEX: 'OFF' },
      onError: (message) => messages.push(message)
    });

    expect(await read('dst', 'en')).toBeUndefined();
    expect(messages).toEqual([
      expect.stringContaining('Table snapshot (bundled) failed')
    ]);
  });
});
