import { z } from 'zod';

import type { CrawlContext, CrawlSource } from '@/crawl';

import type { TableDoc } from 'pxweb-mcp';

export interface PxwebTreeSourceOptions {
  name: string;
  /** PxWeb API v1 root per language, for example "https://px.hagstofa.is/pxen/api/v1". */
  roots: Readonly<Record<string, string>>;
  ratePerSecond: number;
  skipDatabases?: readonly string[];
  maxFolders?: number;
}

const DEFAULT_MAX_FOLDERS = 3000;

const databasesSchema = z.array(
  z.object({ dbid: z.string(), text: z.string() })
);
const nodesSchema = z.array(
  z.object({
    id: z.string(),
    type: z.string(),
    text: z.string(),
    updated: z.string().nullish()
  })
);

async function getJson<T>(
  fetch: CrawlContext['fetch'],
  url: string,
  schema: z.ZodType<T>
): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return schema.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(`${url} returned an unexpected body.`, { cause: err });
  }
}

const encodePath = (parts: readonly string[]): string =>
  parts.map((part) => encodeURIComponent(part)).join('/');

/**
 * Walks the navigation tree of a PxWeb API v1 site, one call per folder. Table
 * ids are "<database>/<folders>/<file>.px", as the multi-database client expects.
 */
export function pxwebTreeSource(options: PxwebTreeSourceOptions): CrawlSource {
  const maxFolders = options.maxFolders ?? DEFAULT_MAX_FOLDERS;
  return {
    name: options.name,
    langs: Object.keys(options.roots),
    ratePerSecond: options.ratePerSecond,
    async crawl(lang, { fetch, step }) {
      const root = options.roots[lang];
      if (!root) throw new Error(`${options.name} has no root for ${lang}.`);
      const languageRoot = `${root.replace(/\/+$/, '')}/${encodeURIComponent(lang)}`;
      const databases = await step('databases', databasesSchema, () =>
        getJson(fetch, languageRoot, databasesSchema)
      );
      const docs = new Map<string, TableDoc>();
      let folders = 0;
      for (const database of databases) {
        if (options.skipDatabases?.includes(database.dbid)) continue;
        const queue = [
          { ids: [database.dbid], labels: [database.text.trim()] }
        ];
        for (let folder = queue.shift(); folder; folder = queue.shift()) {
          folders += 1;
          if (folders > maxFolders) {
            throw new Error(
              `${options.name}/${lang}: more than ${maxFolders} folders.`
            );
          }
          const path = folder.ids.join('/');
          const nodes = await step(`folder:${path}`, nodesSchema, () =>
            getJson(
              fetch,
              `${languageRoot}/${encodePath(folder.ids)}`,
              nodesSchema
            )
          );
          for (const node of nodes) {
            if (node.id.includes('/')) {
              throw new Error(
                `${options.name}/${lang}: id "${node.id}" in ${path} has a "/".`
              );
            }
            const label = node.text.trim();
            if (node.type === 'l') {
              queue.push({
                ids: [...folder.ids, node.id],
                labels: [...folder.labels, label]
              });
              continue;
            }
            if (node.type !== 't') continue;
            const id = `${path}/${node.id}`;
            if (docs.has(id)) continue;
            docs.set(id, {
              id,
              title: label,
              path: folder.labels,
              ...(node.updated ? { updated: node.updated } : {})
            });
          }
        }
      }
      return [...docs.values()];
    }
  };
}
