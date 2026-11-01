import { z } from 'zod';

import type { FlatTable } from '@/json-stat';
import type { TableMetadata, TableVariable } from '@/pxweb-client';
import { comparePeriods, parseSdmxDate, periodCodes } from '@/sdmx-periods';
import type { TableDoc } from '@/table-doc';

/** Dataflow ids; "@" appears in OECD ids such as "DSD_PRICES@DF_PRICES_ALL". */
export const SDMX_ID_PATTERN = /^[A-Za-z0-9_@-]+$/;

const UNIT_ATTRIBUTE = 'UNIT_MEASURE';
const DEFAULT_TIME_ID = 'TIME_PERIOD';
const TIME_LABEL = 'Time period';

const names = z.record(z.string(), z.string()).optional();
const namedItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  names
});

export const dataflowsSchema = z.object({
  data: z.object({
    dataflows: z.array(
      namedItemSchema.extend({ version: z.string(), agencyID: z.string() })
    )
  })
});

export const structureSchema = z.object({
  data: z.object({
    dataflows: z.array(namedItemSchema.extend({ version: z.string() })).min(1),
    dataStructures: z
      .array(
        z.object({
          dataStructureComponents: z.object({
            dimensionList: z.object({
              dimensions: z.array(
                z.object({
                  id: z.string(),
                  position: z.number(),
                  conceptIdentity: z.string().optional(),
                  localRepresentation: z
                    .object({ enumeration: z.string().optional() })
                    .optional()
                })
              ),
              timeDimensions: z.array(z.object({ id: z.string() })).optional()
            })
          })
        })
      )
      .min(1),
    codelists: z
      .array(
        z.object({
          id: z.string(),
          agencyID: z.string().optional(),
          version: z.string().optional(),
          codes: z.array(namedItemSchema).optional()
        })
      )
      .optional(),
    conceptSchemes: z
      .array(
        z.object({
          id: z.string(),
          concepts: z.array(namedItemSchema).optional()
        })
      )
      .optional()
  })
});

const periodBoundSchema = z.object({ period: z.string() }).optional();

export const availabilitySchema = z.object({
  data: z.object({
    contentConstraints: z.array(
      z.object({
        cubeRegions: z
          .array(
            z.object({
              keyValues: z.array(
                z.object({
                  id: z.string(),
                  values: z.array(z.string()).optional(),
                  timeRange: z
                    .object({
                      startPeriod: periodBoundSchema,
                      endPeriod: periodBoundSchema
                    })
                    .optional()
                })
              )
            })
          )
          .optional()
      })
    )
  })
});

const messageComponentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  keyPosition: z.number().optional(),
  values: z.array(namedItemSchema)
});
const attributeIndexes = z.array(z.number().nullable()).nullish();
const cellSchema = z.union([z.number(), z.string(), z.null()]);

export const dataMessageSchema = z.object({
  data: z.object({
    structure: z.object({
      dimensions: z.object({
        dataset: z.array(messageComponentSchema).optional(),
        series: z.array(messageComponentSchema).optional(),
        observation: z.array(messageComponentSchema)
      }),
      attributes: z
        .object({
          dataSet: z.array(messageComponentSchema).optional(),
          series: z.array(messageComponentSchema).optional(),
          observation: z.array(messageComponentSchema).optional()
        })
        .optional()
    }),
    dataSets: z
      .array(
        z.object({
          attributes: attributeIndexes,
          series: z
            .record(
              z.string(),
              z.object({
                attributes: attributeIndexes,
                observations: z.record(z.string(), z.array(cellSchema))
              })
            )
            .optional()
        })
      )
      .min(1)
  })
});

export type SdmxDataflows = z.infer<typeof dataflowsSchema>;
export type SdmxStructure = z.infer<typeof structureSchema>;
export type SdmxAvailability = z.infer<typeof availabilitySchema>;
export type SdmxDataMessage = z.infer<typeof dataMessageSchema>;
type NamedItem = z.infer<typeof namedItemSchema>;

export interface SdmxTableStructure {
  metadata: TableMetadata;
  /** Version of the dataflow; data URLs need it because "latest" is refused there. */
  version: string;
  /** Dimension ids in key order, without the time dimension. */
  dimensionIds: string[];
  timeId: string;
}

function label(item: NamedItem, lang: string): string {
  return item.names?.[lang] ?? item.name ?? item.id;
}

export function toTableDocs(flows: SdmxDataflows, lang: string): TableDoc[] {
  return flows.data.dataflows
    .filter((flow) => SDMX_ID_PATTERN.test(flow.id))
    .map((flow) => ({ id: flow.id, title: label(flow, lang) }));
}

/** "urn:…Codelist=ABS:CL_FREQ(1.0.0)" → { agency: "ABS", id: "CL_FREQ", version: "1.0.0" }. */
function parseUrn(
  urn: string | undefined
): { agency: string; id: string; version: string; item?: string } | undefined {
  const match = /=([^:]+):([^(]+)\(([^)]+)\)(?:\.(.+))?$/.exec(urn ?? '');
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  return {
    agency: match[1],
    id: match[2],
    version: match[3],
    ...(match[4] ? { item: match[4] } : {})
  };
}

function uniqueLabels(codes: readonly NamedItem[], lang: string): string[] {
  const labels = codes.map((code) => label(code, lang));
  const counts = new Map<string, number>();
  for (const text of labels) counts.set(text, (counts.get(text) ?? 0) + 1);
  return labels.map((text, index) =>
    (counts.get(text) ?? 0) > 1 ? `${text} (${codes[index]?.id ?? ''})` : text
  );
}

function timeValues(
  range:
    | { startPeriod?: { period: string }; endPeriod?: { period: string } }
    | undefined,
  frequencies: readonly string[]
): string[] {
  const start = parseSdmxDate(range?.startPeriod?.period ?? '');
  const end = parseSdmxDate(range?.endPeriod?.period ?? '');
  if (!start || !end) return [];
  const codes = new Set(
    frequencies.flatMap((freq) => periodCodes(freq, start, end))
  );
  return [...codes].toSorted(comparePeriods);
}

export function toTableStructure(
  structure: SdmxStructure,
  availability: SdmxAvailability | undefined,
  lang: string
): SdmxTableStructure {
  const {
    dataflows,
    dataStructures,
    codelists = [],
    conceptSchemes = []
  } = structure.data;
  const flow = dataflows[0];
  const components = dataStructures[0]?.dataStructureComponents.dimensionList;
  const keyValues = new Map(
    (
      availability?.data.contentConstraints[0]?.cubeRegions?.[0]?.keyValues ??
      []
    ).map((keyValue) => [keyValue.id, keyValue])
  );
  const timeId = components?.timeDimensions?.[0]?.id ?? DEFAULT_TIME_ID;
  const dimensions = (components?.dimensions ?? [])
    .filter((dimension) => dimension.id !== timeId)
    .toSorted((a, b) => a.position - b.position);

  const variables: TableVariable[] = dimensions.map((dimension) => {
    const listRef = parseUrn(dimension.localRepresentation?.enumeration);
    const codelist = codelists.find(
      (list) =>
        list.id === listRef?.id &&
        (list.agencyID === undefined || list.agencyID === listRef.agency)
    );
    const conceptRef = parseUrn(dimension.conceptIdentity);
    const concept = conceptSchemes
      .find((scheme) => scheme.id === conceptRef?.id)
      ?.concepts?.find((item) => item.id === conceptRef?.item);
    const available = keyValues.get(dimension.id)?.values;
    const allCodes = codelist?.codes ?? [];
    const uniqueAvailable = available ? [...new Set(available)] : undefined;
    const codes = uniqueAvailable
      ? [
          ...allCodes.filter((code) => uniqueAvailable.includes(code.id)),
          ...uniqueAvailable
            .filter((id) => !allCodes.some((code) => code.id === id))
            .map((id) => ({ id }))
        ]
      : allCodes;
    return {
      code: dimension.id,
      label: concept ? label(concept, lang) : dimension.id,
      values: codes.map((code) => code.id),
      valueLabels: uniqueLabels(codes, lang),
      eliminable: false,
      isTime: false
    };
  });

  const freq = variables.find((variable) => variable.code === 'FREQ');
  const periods = timeValues(
    keyValues.get(timeId)?.timeRange,
    freq?.values.length ? freq.values : ['A']
  );
  variables.push({
    code: timeId,
    label: TIME_LABEL,
    values: periods,
    valueLabels: periods,
    eliminable: false,
    isTime: true
  });

  return {
    metadata: { title: flow ? label(flow, lang) : '', variables },
    version: flow?.version ?? '',
    dimensionIds: dimensions.map((dimension) => dimension.id),
    timeId
  };
}

function numberValue(
  cell: z.infer<typeof cellSchema> | undefined
): number | null {
  if (typeof cell === 'number') return cell;
  if (typeof cell !== 'string' || cell.trim() === '') return null;
  const value = Number(cell);
  return Number.isFinite(value) ? value : null;
}

type MessageComponent = z.infer<typeof messageComponentSchema>;

function unitName(
  components: readonly MessageComponent[] | undefined,
  indexes: readonly (string | number | null)[] | null | undefined,
  offset: number,
  lang: string
): string | null {
  const position =
    components?.findIndex((component) => component.id === UNIT_ATTRIBUTE) ?? -1;
  if (position < 0) return null;
  const index = indexes?.[position + offset];
  if (typeof index !== 'number') return null;
  const value = components?.[position]?.values[index];
  return value ? label(value, lang) : null;
}

/** Rows are sorted here because "lastNObservations" answers newest first. */
export function toFlatTable(
  message: SdmxDataMessage,
  metadata: TableMetadata,
  lang: string,
  periods?: ReadonlySet<string>
): FlatTable {
  const { structure, dataSets } = message.data;
  const datasetDimensions = structure.dimensions.dataset ?? [];
  const seriesDimensions = structure.dimensions.series ?? [];
  const keyDimensions = [
    ...datasetDimensions.map((component) => ({ component, inSeries: -1 })),
    ...seriesDimensions.map((component, index) => ({
      component,
      inSeries: index
    }))
  ].toSorted(
    (a, b) => (a.component.keyPosition ?? 0) - (b.component.keyPosition ?? 0)
  );
  const timeDimension = structure.dimensions.observation[0];
  const labels = new Map(
    metadata.variables.map((variable) => [
      variable.code,
      new Map(
        variable.values.map((value, index) => [
          value,
          variable.valueLabels[index] ?? value
        ])
      )
    ])
  );
  const variableLabel = new Map(
    metadata.variables.map((variable) => [variable.code, variable.label])
  );
  const codeLabel = (dimensionId: string, value: NamedItem | undefined) =>
    value ? (labels.get(dimensionId)?.get(value.id) ?? label(value, lang)) : '';

  const attributes = structure.attributes;
  const hasUnit = [
    attributes?.series,
    attributes?.dataSet,
    attributes?.observation
  ].some((list) => list?.some((attribute) => attribute.id === UNIT_ATTRIBUTE));
  const dataSet = dataSets[0];
  const dataSetUnit = unitName(
    attributes?.dataSet,
    dataSet?.attributes,
    0,
    lang
  );

  const rows: {
    key: number[];
    period: string;
    cells: (string | number | null)[];
  }[] = [];
  for (const [seriesKey, series] of Object.entries(dataSet?.series ?? {})) {
    const indexes = seriesKey.split(':').map(Number);
    const cells = keyDimensions.map(({ component, inSeries }) => {
      const value =
        inSeries < 0
          ? component.values[0]
          : component.values[indexes[inSeries] ?? -1];
      return codeLabel(component.id, value);
    });
    const seriesUnit = unitName(attributes?.series, series.attributes, 0, lang);
    for (const [observationKey, observation] of Object.entries(
      series.observations
    )) {
      const period = timeDimension?.values[Number(observationKey)]?.id ?? '';
      if (periods && !periods.has(period)) continue;
      const rowUnit =
        seriesUnit ??
        dataSetUnit ??
        unitName(attributes?.observation, observation, 1, lang);
      rows.push({
        key: indexes,
        period,
        cells: [
          ...cells,
          period,
          numberValue(observation[0]),
          ...(hasUnit ? [rowUnit] : [])
        ]
      });
    }
  }
  rows.sort((a, b) => {
    for (let index = 0; index < Math.max(a.key.length, b.key.length); index++) {
      const difference = (a.key[index] ?? 0) - (b.key[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return comparePeriods(a.period, b.period);
  });

  return {
    label: metadata.title,
    columns: [
      ...keyDimensions.map(
        ({ component }) =>
          variableLabel.get(component.id) ?? component.name ?? component.id
      ),
      TIME_LABEL,
      'Value',
      ...(hasUnit ? ['Unit'] : [])
    ],
    rows: rows.map((row) => row.cells)
  };
}
