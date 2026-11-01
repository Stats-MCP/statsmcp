// Copies the crawled table snapshots into each npm package whose "files" list
// includes "snapshots". Run after `pnpm build`:
//   node scripts/bundle-snapshots.mjs [--from <crawl out dir>] [--strict]
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const MAX_PACKAGE_BYTES = 1024 * 1024;
const packagesUrl = new URL('../packages/', import.meta.url);
const { readSnapshot, snapshotKey, writeSnapshot } = await import(
  new URL('core/dist/index.js', packagesUrl).href
);
const { DEFAULT_INDEX_URL } = await import(
  new URL('core/dist/node.js', packagesUrl).href
);
const TIMEOUT_MS = 30_000;

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    strict: { type: 'boolean', default: false }
  }
});
const indexUrl = DEFAULT_INDEX_URL;
process.stdout.write(`Snapshots from ${values.from ?? indexUrl}\n`);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function download(source, lang) {
  const key = snapshotKey(source, lang);
  if (values.from) {
    try {
      return await readFile(join(resolve(values.from), key));
    } catch (err) {
      if (err.code === 'ENOENT') return undefined;
      throw err;
    }
  }
  try {
    const response = await fetch(`${indexUrl}/${key}`, {
      headers: { 'user-agent': 'statsmcp-release (+https://statsmcp.dev)' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    if (values.strict) throw err;
    process.stderr.write(`${key}: ${err.message}\n`);
    return undefined;
  }
}

function presetOf(module) {
  return Object.values(module).find(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      typeof value.name === 'string' &&
      Array.isArray(value.languages)
  );
}

const missing = [];
for (const dir of await readdir(packagesUrl)) {
  const packageUrl = new URL(`${dir}/`, packagesUrl);
  const manifest = await readJson(new URL('package.json', packageUrl)).catch(
    () => undefined
  );
  if (!manifest?.files?.includes('snapshots')) continue;
  const preset = presetOf(
    await import(new URL('dist/index.mjs', packageUrl).href)
  );
  if (!preset) throw new Error(`${dir}: no preset export found.`);
  const outUrl = new URL('snapshots/', packageUrl);
  await rm(outUrl, { recursive: true, force: true });
  await mkdir(outUrl, { recursive: true });
  let total = 0;
  for (const lang of preset.languages) {
    const bytes = await download(preset.name, lang);
    if (!bytes) {
      missing.push(`${preset.name}/${lang}`);
      continue;
    }
    let snapshot;
    try {
      snapshot = await readSnapshot(
        new Blob([bytes]).stream(),
        preset.name,
        lang
      );
    } catch (err) {
      if (values.strict) throw err;
      process.stderr.write(`${preset.name}/${lang}: ${err.message}\n`);
      missing.push(`${preset.name}/${lang}`);
      continue;
    }
    const gzip = await writeSnapshot(snapshot);
    total += gzip.byteLength;
    await writeFile(new URL(`${lang}.json.gz`, outUrl), gzip);
    process.stdout.write(
      `${manifest.name}: ${lang} ${snapshot.count} tables, ${Math.round(gzip.byteLength / 1024)} KB\n`
    );
  }
  if (total > MAX_PACKAGE_BYTES) {
    throw new Error(
      `${manifest.name}: snapshots are ${Math.round(total / 1024)} KB, over ${MAX_PACKAGE_BYTES / 1024} KB.`
    );
  }
}

if (missing.length > 0) {
  const message = `No snapshot for ${missing.join(', ')}.`;
  if (values.strict) throw new Error(message);
  process.stderr.write(
    `${message} The packages fall back to the live table lists.\n`
  );
}
