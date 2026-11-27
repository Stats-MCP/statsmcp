import { PxwebError } from '@/http';

/** Text per `xml:lang`, for example `{ lt: "Lytis", en: "Sex" }`. */
export type LocalizedText = ReadonlyMap<string, string>;

export interface SdmxMlDataflow {
  id: string;
  names: LocalizedText;
  descriptions: LocalizedText;
  structureId: string | undefined;
}

export interface SdmxMlCode {
  id: string;
  names: LocalizedText;
}

export interface SdmxMlDimension {
  id: string;
  position: number;
  isTime: boolean;
  codelistId: string | undefined;
}

export interface SdmxMlStructure {
  dimensions: SdmxMlDimension[];
  concepts: ReadonlyMap<string, LocalizedText>;
  codelists: ReadonlyMap<string, SdmxMlCode[]>;
}

export interface SdmxMlObservation {
  /** Dimension id → code, in the order of the message. */
  key: ReadonlyMap<string, string>;
  value: string | undefined;
  attributes: ReadonlyMap<string, string>;
}

export interface SdmxMlFooter {
  code: string;
  texts: LocalizedText;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
};
const MAX_CODE_POINT = 0x10ffff;

function decodeOnce(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (!name.startsWith('#')) {
        return Object.hasOwn(ENTITIES, name)
          ? (ENTITIES[name] ?? entity)
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

/** Some OSP labels are escaped twice ("&amp;apos;"), so a second pass is needed. */
export function decodeXml(text: string): string {
  return decodeOnce(decodeOnce(text)).replace(/\s+/g, ' ').trim();
}

function attribute(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : decodeOnce(value);
}

const localizedPatterns = new Map<string, RegExp>();

function localizedPattern(element: string): RegExp {
  let pattern = localizedPatterns.get(element);
  if (!pattern) {
    pattern = new RegExp(
      `<${element} xml:lang="([a-z-]+)">([^<]*)</${element}>`,
      'g'
    );
    localizedPatterns.set(element, pattern);
  }
  return pattern;
}

function localized(block: string, element: string): LocalizedText {
  const texts = new Map<string, string>();
  const pattern = localizedPattern(element);
  for (const [, lang, text] of block.matchAll(pattern)) {
    if (lang && text !== undefined) texts.set(lang, decodeXml(text));
  }
  return texts;
}

/** The text in `lang`, else in English, else in any language that has one. */
export function textIn(
  texts: LocalizedText | undefined,
  lang: string
): string | undefined {
  if (!texts) return undefined;
  const candidates = [texts.get(lang), texts.get('en'), ...texts.values()];
  return candidates.find((text) => text !== undefined && text !== '');
}

function expectRoot(xml: string, root: string): void {
  if (!xml.includes(`<${root}`) || !xml.trimEnd().endsWith(`</${root}>`)) {
    throw new PxwebError(
      'Statistics Lithuania returned an incomplete or unexpected response.',
      502
    );
  }
}

/** The error that OSP puts in the footer of an HTTP 200 answer, if any. */
export function footerMessage(xml: string): SdmxMlFooter | undefined {
  const match = /<footer:Message\b([^>]*)>([\s\S]*?)<\/footer:Message>/.exec(
    xml
  );
  if (!match) return undefined;
  return {
    code: attribute(match[1] ?? '', 'code') ?? '',
    texts: localized(match[2] ?? '', 'com:Text')
  };
}

export function parseDataflows(xml: string): SdmxMlDataflow[] {
  expectRoot(xml, 'mes:Structure');
  return [
    ...xml.matchAll(/<str:Dataflow\b([^>]*)>([\s\S]*?)<\/str:Dataflow>/g)
  ].flatMap(([, tag = '', body = '']) => {
    const id = attribute(tag, 'id');
    if (!id) return [];
    const reference = /<str:Structure>\s*<Ref\b([^>]*)>/.exec(body)?.[1];
    return [
      {
        id,
        names: localized(body, 'com:Name'),
        descriptions: localized(body, 'com:Description'),
        structureId: reference ? attribute(reference, 'id') : undefined
      }
    ];
  });
}

function parseCodes(body: string): SdmxMlCode[] {
  return [
    ...body.matchAll(/<str:Code\b([^>]*?)(?:\/>|>([\s\S]*?)<\/str:Code>)/g)
  ].flatMap(([, tag = '', content = '']) => {
    const id = attribute(tag, 'id');
    return id ? [{ id, names: localized(content, 'com:Name') }] : [];
  });
}

export function parseStructure(xml: string): SdmxMlStructure {
  expectRoot(xml, 'mes:Structure');
  const codelists = new Map<string, SdmxMlCode[]>();
  for (const [, tag = '', body = ''] of xml.matchAll(
    /<str:Codelist\b([^>]*)>([\s\S]*?)<\/str:Codelist>/g
  )) {
    const id = attribute(tag, 'id');
    if (id) codelists.set(id, parseCodes(body));
  }
  const concepts = new Map<string, LocalizedText>();
  for (const [, tag = '', body = ''] of xml.matchAll(
    /<str:Concept\b([^>]*)>([\s\S]*?)<\/str:Concept>/g
  )) {
    const id = attribute(tag, 'id');
    if (id) concepts.set(id, localized(body, 'com:Name'));
  }
  const dimensions = [
    ...xml.matchAll(
      /<str:(Dimension|MeasureDimension|TimeDimension)\b([^>]*)>([\s\S]*?)<\/str:\1>/g
    )
  ]
    .flatMap(([, kind, tag = '', body = '']) => {
      const id = attribute(tag, 'id');
      if (!id) return [];
      const reference = /<str:Enumeration>\s*<Ref\b([^>]*)>/.exec(body)?.[1];
      return [
        {
          id,
          position: Number(attribute(tag, 'position') ?? 0),
          isTime: kind === 'TimeDimension',
          codelistId: reference ? attribute(reference, 'id') : undefined
        }
      ];
    })
    .toSorted((a, b) => a.position - b.position);
  if (dimensions.length === 0) {
    throw new PxwebError(
      'Statistics Lithuania returned a data structure without dimensions.',
      502
    );
  }
  return { dimensions, concepts, codelists };
}

function values(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, tag = ''] of block.matchAll(/<g:Value\b([^>]*?)\/?>/g)) {
    const id = attribute(tag, 'id');
    const value = attribute(tag, 'value');
    if (id && value !== undefined) found.set(id, value);
  }
  return found;
}

export interface SdmxMlDataHeader {
  /** `mes:Prepared`, when the office extracted the data. */
  prepared: string | undefined;
  /** Attributes of the whole data set. */
  attributes: ReadonlyMap<string, string>;
  footer: SdmxMlFooter | undefined;
}

export interface GenericDataReader {
  push(text: string): void;
  finish(): SdmxMlDataHeader;
}

const OBS_OPEN = '<g:Obs>';
const OBS_CLOSE = '</g:Obs>';

function parseObservation(body: string): SdmxMlObservation {
  const key = /<g:ObsKey>([\s\S]*?)<\/g:ObsKey>/.exec(body)?.[1] ?? '';
  const valueTag = /<g:ObsValue\b([^>]*)>/.exec(body)?.[1];
  const attributes =
    /<g:Attributes>([\s\S]*?)<\/g:Attributes>/.exec(body)?.[1] ?? '';
  return {
    key: values(key),
    value: valueTag ? attribute(valueTag, 'value') : undefined,
    attributes: values(attributes)
  };
}

/**
 * Reads SDMX-ML 2.1 generic data (all dimensions at the observation level) in
 * chunks, so a large message is never held in memory as a whole.
 */
export function createGenericDataReader(
  onObservation: (observation: SdmxMlObservation) => void
): GenericDataReader {
  let head: string | undefined;
  let buffer = '';
  return {
    push(text) {
      buffer += text;
      let offset = 0;
      for (;;) {
        const start = buffer.indexOf(OBS_OPEN, offset);
        const end = start < 0 ? -1 : buffer.indexOf(OBS_CLOSE, start);
        if (end < 0) break;
        head ??= buffer.slice(0, start);
        onObservation(
          parseObservation(buffer.slice(start + OBS_OPEN.length, end))
        );
        offset = end + OBS_CLOSE.length;
      }
      buffer = buffer.slice(offset);
    },
    finish() {
      const header = head ?? buffer;
      expectRoot((head ?? '') + buffer, 'mes:GenericData');
      const dataSet = header.slice(Math.max(0, header.indexOf('<mes:DataSet')));
      return {
        prepared: /<mes:Prepared>([^<]*)<\/mes:Prepared>/.exec(header)?.[1],
        attributes: values(
          /<g:Attributes>([\s\S]*?)<\/g:Attributes>/.exec(dataSet)?.[1] ?? ''
        ),
        footer: footerMessage(buffer)
      };
    }
  };
}
