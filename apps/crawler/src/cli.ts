import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import {
  buildSearchIndex,
  readSnapshot,
  snapshotKey,
  urlSnapshotReader,
  writeSnapshot
} from '@statsmcp/core';
import { z } from 'zod';

import { crawlSource } from '@/crawl';
import { SOURCES } from '@/sources';

const { version } = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    )
  );
const USER_AGENT = `statsmcp-index/${version} (+https://statsmcp.dev)`;

const { values } = parseArgs({
  options: {
    source: { type: 'string', multiple: true },
    lang: { type: 'string', multiple: true },
    out: { type: 'string', default: 'out' },
    checkpoints: { type: 'string', default: '.crawl' },
    previous: { type: 'string', default: 'https://statsmcp.dev' },
    force: { type: 'boolean', default: false },
    reindex: { type: 'boolean', default: false }
  }
});

const requested = values.source ?? [];
const unknown = requested.filter(
  (name) => name !== 'all' && !SOURCES.some((source) => source.name === name)
);
if (requested.length === 0 || unknown.length > 0) {
  console.error(
    `Usage: crawl --source <${['all', ...SOURCES.map((source) => source.name)].join('|')}> [--lang <code>] [--out dir] [--force] [--reindex]` +
      (unknown.length > 0 ? `\nUnknown source: ${unknown.join(', ')}` : '')
  );
  process.exit(2);
}
const selected = requested.includes('all')
  ? SOURCES
  : SOURCES.filter((source) => requested.includes(source.name));

const langs = values.lang;
if (
  langs &&
  !selected.some((source) => source.langs.some((lang) => langs.includes(lang)))
) {
  console.error(`No selected source has the language ${langs.join(', ')}.`);
  process.exit(2);
}

// --reindex adds the prebuilt search index to the snapshots already in --out, with no crawl.
if (values.reindex) {
  for (const source of selected) {
    for (const lang of source.langs.filter(
      (code) => !langs || langs.includes(code)
    )) {
      const file = join(values.out, snapshotKey(source.name, lang));
      if (!existsSync(file)) continue;
      const snapshot = await readSnapshot(
        new Blob([await readFile(file)]).stream(),
        source.name,
        lang
      );
      const searchIndex = buildSearchIndex(snapshot.docs, lang);
      await writeFile(file, await writeSnapshot({ ...snapshot, searchIndex }));
      process.stdout.write(
        `${source.name}/${lang}: search index for ${snapshot.count} tables\n`
      );
    }
  }
  process.exit(0);
}

const previous = urlSnapshotReader(values.previous, { userAgent: USER_AGENT });
let failed = false;
for (const source of selected) {
  try {
    await crawlSource(source, {
      outDir: values.out,
      checkpointDir: values.checkpoints,
      userAgent: USER_AGENT,
      previous,
      force: values.force,
      ...(langs ? { langs } : {}),
      log: (line) => process.stdout.write(`${line}\n`)
    });
  } catch (err) {
    failed = true;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      message.startsWith(`${source.name}/`)
        ? message
        : `${source.name}: ${message}`
    );
  }
}
process.exit(failed ? 1 : 0);
