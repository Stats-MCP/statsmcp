import { readFile } from 'node:fs/promises';

import {
  firstSnapshot,
  readSnapshot,
  snapshotKey,
  urlSnapshotReader,
  type SnapshotReader
} from '@/snapshot';

export const DEFAULT_INDEX_URL = 'https://statsmcp.dev';

export interface NodeTableSnapshotsOptions {
  userAgent?: string;
  env?: Readonly<Record<string, string | undefined>>;
  /** Where to report a snapshot that failed to load; defaults to stderr. */
  onError?: (message: string) => void;
}

const REMOTE_TIMEOUT_MS = 5000;

function bundledReader(dir: URL): SnapshotReader {
  return async (source, lang) => {
    snapshotKey(source, lang);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await readFile(new URL(`${lang}.json.gz`, dir)));
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }
    return readSnapshot(new Blob([bytes]).stream(), source, lang);
  };
}

/**
 * Snapshots for the npm packages: statsmcp.dev first, then the copy bundled in the
 * package at release. `STATSMCP_INDEX=off` skips statsmcp.dev; `STATSMCP_INDEX_URL`
 * points at a mirror.
 */
export function nodeTableSnapshots(
  bundledDir: URL,
  options: NodeTableSnapshotsOptions = {}
): SnapshotReader {
  const env = options.env ?? process.env;
  const report =
    options.onError ??
    ((message: string) => process.stderr.write(`${message}\n`));
  const remote =
    env.STATSMCP_INDEX?.toLowerCase() === 'off'
      ? []
      : [
          urlSnapshotReader(env.STATSMCP_INDEX_URL || DEFAULT_INDEX_URL, {
            userAgent: options.userAgent,
            timeoutMs: REMOTE_TIMEOUT_MS
          })
        ];
  const readers = [...remote, bundledReader(bundledDir)];
  return firstSnapshot(readers, {
    onError: (error, position) => {
      const reader = position === readers.length - 1 ? 'bundled' : 'remote';
      const reason = error instanceof Error ? error.message : String(error);
      report(`Table snapshot (${reader}) failed: ${reason}`);
    }
  });
}
