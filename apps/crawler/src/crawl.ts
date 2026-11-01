import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  SNAPSHOT_VERSION,
  snapshotKey,
  writeSnapshot,
  type Snapshot,
  type SnapshotReader,
  type TableDoc
} from 'pxweb-mcp';

import { openCheckpoint, type Checkpoint } from '@/checkpoint';
import { createCrawlFetch, type CrawlFetch } from '@/crawl-fetch';
import { createTokenBucket } from '@/token-bucket';
import { snapshotProblems } from '@/validate';

export interface CrawlContext {
  fetch: CrawlFetch;
  step: Checkpoint['step'];
}

export interface CrawlSource {
  name: string;
  langs: readonly string[];
  /** At most half of the rate that the office allows or advertises. */
  ratePerSecond: number;
  burst?: number;
  crawl(lang: string, context: CrawlContext): Promise<TableDoc[]>;
}

export interface CrawlOptions {
  outDir: string;
  checkpointDir: string;
  userAgent: string;
  previous: SnapshotReader;
  langs?: readonly string[];
  force?: boolean;
  fetch?: CrawlFetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface CrawlFailure {
  source: string;
  lang: string;
  error: unknown;
}

export interface CrawlResult {
  source: string;
  lang: string;
  count: number;
  previousCount?: number;
  file: string;
}

export class CrawlError extends Error {
  constructor(
    readonly results: readonly CrawlResult[],
    readonly failures: readonly CrawlFailure[]
  ) {
    super(
      failures
        .map(
          (failure) =>
            `${failure.source}/${failure.lang}: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`
        )
        .join('\n')
    );
    this.name = 'CrawlError';
  }
}

export class CrawlValidationError extends Error {
  constructor(
    readonly source: string,
    readonly lang: string,
    readonly problems: readonly string[]
  ) {
    super(`${source}/${lang}: ${problems.join('; ')}`);
    this.name = 'CrawlValidationError';
  }
}

async function readPrevious(
  source: CrawlSource,
  lang: string,
  options: CrawlOptions
): Promise<Snapshot | undefined> {
  try {
    return await options.previous(source.name, lang);
  } catch (err) {
    if (!options.force) throw err;
    options.log?.(
      `${source.name}/${lang}: previous snapshot unreadable, forced past: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

async function crawlLanguage(
  source: CrawlSource,
  lang: string,
  fetch: CrawlFetch,
  previous: Snapshot | undefined,
  options: CrawlOptions
): Promise<CrawlResult> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const key = snapshotKey(source.name, lang);
  const checkpoint = await openCheckpoint(
    join(options.checkpointDir, `${source.name}-${lang}.json`)
  );
  if (checkpoint.discarded) {
    log(`${source.name}/${lang}: starting fresh, ${checkpoint.discarded}`);
  } else if (checkpoint.size > 0) {
    log(`${source.name}/${lang}: resuming after ${checkpoint.size} steps`);
  }
  const docs = await source.crawl(lang, { fetch, step: checkpoint.step });
  const snapshot: Snapshot = {
    version: SNAPSHOT_VERSION,
    source: source.name,
    lang,
    builtAt: now().toISOString(),
    count: docs.length,
    docs
  };
  const problems = snapshotProblems(snapshot, previous);
  if (problems.length > 0 && !options.force) {
    // A forced re-run crawls again rather than replaying a suspect list.
    await checkpoint.clear();
    throw new CrawlValidationError(source.name, lang, problems);
  }
  const file = join(options.outDir, key);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await writeSnapshot(snapshot));
  await checkpoint.clear();
  const was = previous ? ` (was ${previous.count})` : '';
  const forced =
    problems.length > 0 ? `; forced past: ${problems.join('; ')}` : '';
  log(`${source.name}/${lang}: ${docs.length} tables${was}${forced}`);
  return {
    source: source.name,
    lang,
    count: docs.length,
    ...(previous ? { previousCount: previous.count } : {}),
    file
  };
}

export async function crawlSource(
  source: CrawlSource,
  options: CrawlOptions
): Promise<CrawlResult[]> {
  const bucket = createTokenBucket({
    ratePerSecond: source.ratePerSecond,
    burst: source.burst,
    sleep: options.sleep
  });
  const fetch = createCrawlFetch({
    bucket,
    userAgent: options.userAgent,
    fetch: options.fetch,
    sleep: options.sleep
  });
  const wanted = options.langs;
  const langs = wanted
    ? source.langs.filter((lang) => wanted.includes(lang))
    : source.langs;
  const previous = new Map<string, Snapshot | undefined>();
  for (const lang of langs) {
    previous.set(lang, await readPrevious(source, lang, options));
  }
  const results: CrawlResult[] = [];
  const failures: CrawlFailure[] = [];
  for (const lang of langs) {
    try {
      results.push(
        await crawlLanguage(source, lang, fetch, previous.get(lang), options)
      );
    } catch (error) {
      failures.push({ source: source.name, lang, error });
    }
  }
  if (failures.length > 0) throw new CrawlError(results, failures);
  return results;
}
