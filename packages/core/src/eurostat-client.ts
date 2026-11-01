import {
  createRequester,
  createTextRequester,
  DATA_TTL_SECONDS,
  METADATA_TTL_SECONDS,
  PxwebError,
  SEARCH_TTL_SECONDS,
  toFlatTable,
  type HttpOptions
} from '@/http';
import { jsonStatDatasetSchema } from '@/json-stat';
import type { PxwebClient, TableMetadata, TableVariable } from '@/pxweb-client';
import { createTableIndexLoader, type TableDoc } from '@/table-index';

const CODE_PATTERN = /^[A-Za-z0-9_$.-]+$/;
const CLOSED_TITLE = /\(\d{4}\s*-\s*\d{4}\)\s*$/;
const TIME_CODE = 'time';
const NOT_FOUND_STATUSES = new Set([400, 404]);
const TEXT: RequestInit = { method: 'GET', headers: { accept: '*/*' } };

export interface EurostatClientOptions extends HttpOptions {
  /** Root of the dissemination API, "https://ec.europa.eu/eurostat/api/dissemination". */
  baseUrl: string;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

interface TocEntry {
  code: string;
  title: string;
  /** Folder titles above the table, from the indentation of the table of contents. */
  path: string[];
  updated: string | undefined;
  start: string;
  end: string;
}

const TOC_INDENT = 4;

function tocCell(cell: string): string {
  return cell.trim().replace(/^"|"$/g, '').replaceAll('""', '"').trim();
}

interface Code {
  id: string;
  label: string;
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
};

const MAX_CODE_POINT = 0x10ffff;

function decodeXml(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (!name.startsWith('#')) {
        return Object.hasOwn(XML_ENTITIES, name)
          ? (XML_ENTITIES[name] ?? entity)
          : entity;
      }
      const point =
        name[1]?.toLowerCase() === 'x'
          ? Number.parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return point <= MAX_CODE_POINT ? String.fromCodePoint(point) : entity;
    }
  );
}

/** Turns `<s:Code id="X"/>` into `<s:Code id="X"></s:Code>`, so one pattern reads both forms. */
function expandSelfClosing(xml: string): string {
  return xml.replace(
    /<(s:(?:Concept|Codelist|Code|Dimension))\b([^>]*?)\/>/g,
    '<$1$2></$1>'
  );
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

/** Name in the asked language, else English, else the code. */
function nameIn(block: string, lang: string): string | undefined {
  const names = [
    ...block.matchAll(/<c:Name xml:lang="([a-z]+)">([^<]*)<\/c:Name>/g)
  ];
  const match =
    names.find((name) => name[1] === lang) ??
    names.find((name) => name[1] === 'en');
  return match?.[2] === undefined ? undefined : decodeXml(match[2]);
}

/** Dimension order and codes from an SDMX-ML 2.1 structure message. */
export function parseStructure(
  xml: string,
  lang: string
): { dimensions: { id: string; label: string; codes: Code[] }[] } {
  xml = expandSelfClosing(xml);
  const concepts = new Map<string, string>();
  for (const concept of xml.matchAll(
    /<s:Concept\b([^>]*)>([\s\S]*?)<\/s:Concept>/g
  )) {
    const id = attribute(concept[1] ?? '', 'id');
    const name = nameIn(concept[2] ?? '', lang);
    if (id && name) concepts.set(id, name);
  }
  const codelists = new Map<string, Code[]>();
  for (const list of xml.matchAll(
    /<s:Codelist\b([^>]*)>([\s\S]*?)<\/s:Codelist>/g
  )) {
    const id = attribute(list[1] ?? '', 'id');
    if (!id) continue;
    const codes = [
      ...(list[2] ?? '').matchAll(/<s:Code\b([^>]*)>([\s\S]*?)<\/s:Code>/g)
    ].map((code) => {
      const codeId = decodeXml(attribute(code[1] ?? '', 'id') ?? '');
      return { id: codeId, label: nameIn(code[2] ?? '', lang) ?? codeId };
    });
    codelists.set(id, codes);
  }
  const dimensions = [
    ...xml.matchAll(/<s:Dimension\b([^>]*)>([\s\S]*?)<\/s:Dimension>/g)
  ]
    .map((dimension) => {
      const reference =
        /<Ref\b[^>]*\bclass="Codelist"[^>]*>/.exec(dimension[2] ?? '')?.[0] ??
        '';
      return {
        id: attribute(dimension[1] ?? '', 'id') ?? '',
        position: Number(attribute(dimension[1] ?? '', 'position') ?? 0),
        codes: codelists.get(attribute(reference, 'id') ?? '') ?? []
      };
    })
    .filter((dimension) => dimension.id)
    .toSorted((a, b) => a.position - b.position)
    .map(({ id, codes }) => ({ id, label: concepts.get(id) ?? id, codes }));
  return { dimensions };
}

/** Rows of the tab-separated table of contents that are datasets or tables. */
export function parseToc(tsv: string): TocEntry[] {
  const folders: string[] = [];
  const entries: TocEntry[] = [];
  for (const line of tsv.split('\n').slice(1)) {
    const raw = line.split('\t');
    const first = (raw[0] ?? '').replace(/^"/, '');
    const depth = Math.floor(
      (first.length - first.trimStart().length) / TOC_INDENT
    );
    const cells = raw.map(tocCell);
    const title = cells[0] ?? '';
    if (cells[2] === 'folder') {
      folders.length = depth;
      folders[depth] = title;
      continue;
    }
    if (cells[2] !== 'dataset' && cells[2] !== 'table') continue;
    const [day, month, year] = (cells[3] ?? '').split('.');
    entries.push({
      code: cells[1] ?? '',
      title,
      path: folders.slice(0, depth).filter(Boolean),
      updated: year && month && day ? `${year}-${month}-${day}` : undefined,
      start: cells[5] ?? '',
      end: cells[6] ?? ''
    });
  }
  return entries;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

type Step = 'A' | 'S' | 'Q' | 'M';

const PERIODS_PER_YEAR: Readonly<Record<Step, number>> = {
  A: 1,
  S: 2,
  Q: 4,
  M: 12
};

function periodParts(period: string): [number, number] | undefined {
  const match = /^(\d{4})(?:-(?:Q|S)?(\d{1,2}))?$/.exec(period);
  return match ? [Number(match[1]), Number(match[2] ?? 1)] : undefined;
}

function stepOf(period: string): Step | undefined {
  if (/^\d{4}$/.test(period)) return 'A';
  if (/^\d{4}-Q\d$/.test(period)) return 'Q';
  if (/^\d{4}-S\d$/.test(period)) return 'S';
  if (/^\d{4}-\d{2}$/.test(period)) return 'M';
  return undefined;
}

function formatPeriod(step: Step, year: number, sub: number): string {
  if (step === 'A') return String(year);
  if (step === 'M') return `${year}-${pad(sub)}`;
  return `${year}-${step}${sub}`;
}

/**
 * All periods from start to end for yearly, half-yearly, quarterly and monthly data.
 * Weekly and daily data get only the last period.
 */
export function periodsBetween(start: string, end: string): string[] {
  const from = periodParts(start);
  const to = periodParts(end);
  const step = stepOf(end);
  if (!from || !to || !step) return end ? [end] : [];
  const perYear = PERIODS_PER_YEAR[step];
  const periods: string[] = [];
  for (
    let index = from[0] * perYear + from[1] - 1;
    index <= to[0] * perYear + to[1] - 1;
    index++
  ) {
    periods.push(
      formatPeriod(step, Math.floor(index / perYear), (index % perYear) + 1)
    );
  }
  return periods;
}

function uniqueByCode(entries: TocEntry[]): TocEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.code)) return false;
    seen.add(entry.code);
    return true;
  });
}

function notFound(code: string): PxwebError {
  return new PxwebError(
    `Table "${code}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function checkCode(code: string): void {
  if (!CODE_PATTERN.test(code)) {
    throw new PxwebError(
      `Invalid table id "${code}". Use the id exactly as search_tables returns it.`,
      400
    );
  }
}

/**
 * Client for the Eurostat dissemination API: search over the table of contents,
 * structure from SDMX 2.1, data as JSON-stat 2.0.
 */
export function createEurostatClient(
  options: EurostatClientOptions
): PxwebClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const requestText = createTextRequester(options);
  const loading = new Map<string, Promise<TocEntry[]>>();

  const parsed = new Map<string, { at: number; entries: TocEntry[] }>();

  /** The TOC is about 2 MB, so the parsed and deduplicated list stays in memory for an hour. */
  function toc(lang: string): Promise<TocEntry[]> {
    const fresh = parsed.get(lang);
    if (fresh && Date.now() - fresh.at < SEARCH_TTL_SECONDS * 1000) {
      return Promise.resolve(fresh.entries);
    }
    const pending = loading.get(lang);
    if (pending) return pending;
    const url = `${baseUrl}/catalogue/toc/txt?lang=${encodeURIComponent(lang)}`;
    const promise = requestText(
      url,
      TEXT,
      (tsv) => {
        const entries = uniqueByCode(parseToc(tsv));
        if (entries.length === 0) {
          throw new PxwebError(
            'Eurostat returned an empty table of contents.',
            502
          );
        }
        return entries;
      },
      SEARCH_TTL_SECONDS,
      `toc:${url}`
    )
      .then((entries) => {
        parsed.set(lang, { at: Date.now(), entries });
        return entries;
      })
      .finally(() => loading.delete(lang));
    loading.set(lang, promise);
    return promise;
  }

  const tableIndex = createTableIndexLoader(
    async (lang) =>
      (await toc(lang)).map((entry): TableDoc => ({
        id: entry.code,
        title: entry.title,
        path: entry.path,
        ...(entry.updated ? { updated: entry.updated } : {}),
        ...(entry.end ? { lastPeriod: entry.end } : {}),
        ...(CLOSED_TITLE.test(entry.title) ? { discontinued: true } : {})
      })),
    {
      ttlSeconds: SEARCH_TTL_SECONDS,
      currentYear: () => now().getUTCFullYear()
    }
  );

  async function metadata(lang: string, code: string): Promise<TableMetadata> {
    const entry = (await toc(lang)).find((item) => item.code === code);
    if (!entry) {
      throw notFound(code);
    }
    const url = `${baseUrl}/sdmx/2.1/dataflow/ESTAT/${encodeURIComponent(code)}/latest?references=descendants&detail=referencepartial`;
    const structure = await requestText(
      url,
      TEXT,
      (xml) => {
        const result = parseStructure(xml, lang);
        if (result.dimensions.length === 0) {
          throw new PxwebError(
            'Eurostat returned a structure without dimensions.',
            502
          );
        }
        return result;
      },
      METADATA_TTL_SECONDS,
      `meta:${url}:${lang}`
    ).catch((err: unknown) => {
      if (err instanceof PxwebError && NOT_FOUND_STATUSES.has(err.status)) {
        throw notFound(code);
      }
      throw err;
    });
    const variables: TableVariable[] = structure.dimensions.map(
      (dimension) => ({
        code: dimension.id,
        label: dimension.label,
        values: dimension.codes.map((item) => item.id),
        valueLabels: dimension.codes.map((item) => item.label),
        eliminable: false,
        isTime: false
      })
    );
    const periods = periodsBetween(entry.start, entry.end);
    variables.push({
      code: TIME_CODE,
      label: TIME_CODE,
      values: periods,
      valueLabels: periods,
      eliminable: false,
      isTime: true
    });
    return { title: entry.title, variables };
  }

  return {
    async search(lang, query, searchOptions) {
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, code) {
      checkCode(code);
      return metadata(lang, code);
    },

    async query(lang, code, selections) {
      checkCode(code);
      const params = new URLSearchParams({ lang });
      const needsCodes = selections.some(
        (selection) =>
          selection.selection.filter === 'top' && selection.code !== TIME_CODE
      );
      const known = needsCodes ? await metadata(lang, code) : undefined;
      for (const selection of selections) {
        const { filter, values } = selection.selection;
        if (filter === 'all') continue;
        const count = Math.max(1, Number(values[0]) || 1);
        if (filter === 'top' && selection.code === TIME_CODE) {
          params.append('lastTimePeriod', String(count));
          continue;
        }
        let codes = values;
        if (filter === 'top') {
          const variable = known?.variables.find(
            (item) => item.code === selection.code
          );
          if (!variable) {
            throw new PxwebError(
              `Table "${code}" has no variable "${selection.code}". Call get_table_metadata to see its variables.`,
              400
            );
          }
          codes = variable.values.slice(-count);
        }
        for (const value of codes) params.append(selection.code, value);
      }
      const url = `${baseUrl}/statistics/1.0/data/${encodeURIComponent(code)}?${params.toString()}`;
      return request(
        url,
        { method: 'GET' },
        jsonStatDatasetSchema,
        toFlatTable,
        DATA_TTL_SECONDS,
        `data:${url}`
      ).catch((err: unknown) => {
        if (err instanceof PxwebError && err.status === 404) {
          throw notFound(code);
        }
        throw err;
      });
    }
  };
}
