import { z } from 'zod';

import { tableDocSchema } from '@/table-doc';

/** Format version of a table snapshot; readers reject other versions. */
export const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const KEY_PART = /^[A-Za-z0-9_-]+$/;
const GZIP_MAGIC = [0x1f, 0x8b] as const;

const snapshotSchema = z
  .object({
    version: z.literal(SNAPSHOT_VERSION),
    source: z.string().min(1),
    lang: z.string().min(1),
    builtAt: z.iso.datetime(),
    count: z.number().int().nonnegative(),
    docs: z.array(tableDocSchema)
  })
  .refine((snapshot) => snapshot.count === snapshot.docs.length, {
    message: 'count does not match the number of tables'
  });

/** A source's table catalogue in one language, as the crawler stores it. */
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Reads the snapshot of a source and language, or gives undefined when there is none. */
export type SnapshotReader = (
  source: string,
  lang: string
) => Promise<Snapshot | undefined>;

/** The part of a Cloudflare R2 bucket binding that the reader needs. */
export interface SnapshotBucket {
  get(
    key: string
  ): Promise<{ body: ReadableStream<Uint8Array<ArrayBuffer>> } | null>;
}

export interface UrlSnapshotReaderOptions {
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

/** Object key and URL path of a snapshot: `index/<source>/<lang>.json.gz`. */
export function snapshotKey(source: string, lang: string): string {
  if (!KEY_PART.test(source) || !KEY_PART.test(lang)) {
    throw new Error(
      `Invalid snapshot source "${source}" or language "${lang}".`
    );
  }
  return `index/${source}/${lang}.json.gz`;
}

async function readBytes(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SNAPSHOT_BYTES) {
      await reader.cancel();
      throw new Error('Snapshot is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Reads gzip or plain JSON: hosts that send `Content-Encoding: gzip` let fetch
 * decompress the body already. Both sizes are capped.
 */
async function readSnapshotText(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>
): Promise<string> {
  const raw = await readBytes(stream);
  const gzipped = raw[0] === GZIP_MAGIC[0] && raw[1] === GZIP_MAGIC[1];
  const text = gzipped
    ? await readBytes(
        new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))
      )
    : raw;
  return new TextDecoder().decode(text);
}

/** Decompresses and validates a gzip snapshot for the expected source and language. */
export async function readSnapshot(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  source: string,
  lang: string
): Promise<Snapshot> {
  const snapshot = snapshotSchema.parse(
    JSON.parse(await readSnapshotText(body))
  );
  if (snapshot.source !== source || snapshot.lang !== lang) {
    throw new Error(
      `Snapshot is for ${snapshot.source}/${snapshot.lang}, not ${source}/${lang}.`
    );
  }
  return snapshot;
}

/** Serialises and gzips a snapshot, for the crawler and for bundling. */
export async function writeSnapshot(
  snapshot: Snapshot
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([JSON.stringify(snapshotSchema.parse(snapshot))])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads snapshots over HTTP(S), for example from https://statsmcp.dev. */
export function urlSnapshotReader(
  baseUrl: string,
  options: UrlSnapshotReaderOptions = {}
): SnapshotReader {
  const root = baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  return async (source, lang) => {
    const response = await doFetch(`${root}/${snapshotKey(source, lang)}`, {
      headers: options.userAgent ? { 'user-agent': options.userAgent } : {},
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`Snapshot request returned HTTP ${response.status}.`);
    }
    return readSnapshot(response.body, source, lang);
  };
}

/** Reads snapshots from an R2 bucket binding in the Worker. */
export function bucketSnapshotReader(bucket: SnapshotBucket): SnapshotReader {
  return async (source, lang) => {
    const object = await bucket.get(snapshotKey(source, lang));
    return object ? readSnapshot(object.body, source, lang) : undefined;
  };
}

/**
 * Tries the readers in order and returns the first snapshot found. A reader that
 * fails counts as "no snapshot", so a broken mirror falls through to the next one.
 */
export function firstSnapshot(
  readers: readonly SnapshotReader[],
  options: { onError?: (error: unknown, reader: number) => void } = {}
): SnapshotReader {
  return async (source, lang) => {
    for (const [position, read] of readers.entries()) {
      try {
        const snapshot = await read(source, lang);
        if (snapshot) return snapshot;
      } catch (err) {
        options.onError?.(err, position);
      }
    }
    return undefined;
  };
}
