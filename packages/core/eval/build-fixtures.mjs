#!/usr/bin/env node
// Downloads the table lists that the search-quality tests use. Run by hand:
// node packages/core/eval/build-fixtures.mjs
// statice-en, dzs-en and cso-en come from the crawler instead (apps/crawler, --source statice/dzs/cso).
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const UA = { 'user-agent': 'statsmcp-index/0 (+https://statsmcp.dev)' };
const out = new URL('./fixtures/', import.meta.url);

function save(source, lang, docs) {
  if (docs.length === 0) throw new Error(`${source}-${lang}: no tables`);
  const snapshot = {
    source,
    lang,
    builtAt: new Date().toISOString(),
    count: docs.length,
    docs
  };
  const file = new URL(`${source}-${lang}.json.gz`, out);
  writeFileSync(file, gzipSync(JSON.stringify(snapshot)));
  process.stdout.write(`${source}-${lang}: ${docs.length} tables\n`);
}

async function json(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { ...UA, ...init?.headers }
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function eurostat(lang) {
  const tsv = await (
    await fetch(
      `https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=${lang}`,
      { headers: UA }
    )
  ).text();
  const stack = [];
  const seen = new Map();
  for (const line of tsv.split('\n').slice(1)) {
    const cells = line
      .split('\t')
      .map((cell) => cell.replace(/^"|"$/g, '').replaceAll('""', '"'));
    const raw = cells[0] ?? '';
    const depth = Math.floor((raw.length - raw.trimStart().length) / 4);
    const title = raw.trim();
    const [code, type, updated, , , end] = [
      cells[1],
      cells[2],
      cells[3],
      cells[4],
      cells[5],
      cells[6]
    ];
    if (type === 'folder') {
      stack.length = depth;
      stack[depth] = title;
      continue;
    }
    if ((type !== 'dataset' && type !== 'table') || !code || seen.has(code))
      continue;
    const [d, m, y] = (updated ?? '').split('.');
    seen.set(code, {
      id: code,
      title,
      path: stack.slice(0, depth).filter(Boolean),
      ...(y ? { updated: `${y}-${m}-${d}` } : {}),
      ...(end ? { lastPeriod: end } : {}),
      ...(/\(\d{4}\s*-\s*\d{4}\)\s*$/.test(title) ? { discontinued: true } : {})
    });
  }
  save('eurostat', lang, [...seen.values()]);
}

async function dst(lang) {
  const list = await json('https://api.statbank.dk/v1/tables', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lang })
  });
  save(
    'dst',
    lang,
    list.map((t) => ({
      id: t.id,
      title: t.text,
      ...(t.updated ? { updated: t.updated.slice(0, 10) } : {}),
      ...(t.latestPeriod ? { lastPeriod: t.latestPeriod } : {}),
      ...(t.active === false ? { discontinued: true } : {})
    }))
  );
}

async function cbs() {
  const data = await json(
    'https://opendata.cbs.nl/ODataCatalog/Tables?$format=json&$select=Identifier,Title,Language,Modified,OutputStatus,Period'
  );
  for (const lang of ['en', 'nl']) {
    save(
      'cbs',
      lang,
      data.value
        .filter((t) => t.Language === lang)
        .map((t) => ({
          id: t.Identifier,
          title: t.Title,
          ...(t.Modified ? { updated: t.Modified.slice(0, 10) } : {}),
          ...(t.Period ? { lastPeriod: t.Period } : {}),
          ...(['Gediscontinueerd', 'Discontinued'].includes(t.OutputStatus)
            ? { discontinued: true }
            : {})
        }))
    );
  }
}

async function statcan() {
  const cubes = await json(
    'https://www150.statcan.gc.ca/t1/wds/rest/getAllCubesListLite'
  );
  for (const lang of ['en', 'fr']) {
    save(
      'statcan',
      lang,
      cubes.map((c) => ({
        id: String(c.productId),
        title: lang === 'fr' ? c.cubeTitleFr : c.cubeTitleEn,
        ...(c.releaseTime ? { updated: c.releaseTime.slice(0, 10) } : {}),
        ...(c.cubeEndDate ? { lastPeriod: c.cubeEndDate.slice(0, 10) } : {}),
        ...(String(c.archived) === '1' ? { discontinued: true } : {})
      }))
    );
  }
}

async function scb(lang) {
  const docs = [];
  for (let page = 1; ; page++) {
    const data = await json(
      `https://statistikdatabasen.scb.se/api/v2/tables?lang=${lang}&pageSize=1000&pageNumber=${page}`
    );
    for (const t of data.tables) {
      docs.push({
        id: t.id,
        title: t.label,
        path: (t.paths?.[0] ?? []).map((p) => p.label),
        ...(t.updated ? { updated: t.updated.slice(0, 10) } : {}),
        ...(t.lastPeriod ? { lastPeriod: t.lastPeriod } : {}),
        ...(t.discontinued ? { discontinued: true } : {})
      });
    }
    if (page >= data.page.totalPages) break;
  }
  save('scb', lang, docs);
}

await eurostat('en');
await dst('en');
await dst('da');
await cbs();
await statcan();
await scb('en');
