import { describe, expect, it } from 'vitest';

import {
  availabilitySchema,
  dataflowsSchema,
  dataMessageSchema,
  structureSchema,
  toFlatTable,
  toTableDocs,
  toTableStructure,
  type SdmxAvailability,
  type SdmxDataMessage,
  type SdmxStructure
} from '@/sdmx-json';

const codelist = (id: string) =>
  `urn:sdmx:org.sdmx.infomodel.codelist.Codelist=ABS:${id}(1.0.0)`;
const concept = (id: string) =>
  `urn:sdmx:org.sdmx.infomodel.conceptscheme.Concept=ABS:CS_COMMON(1.0.0).${id}`;

const structure: SdmxStructure = {
  data: {
    dataflows: [
      {
        id: 'CPI',
        version: '2.0.0',
        name: 'Consumer Price Index (CPI)',
        names: { en: 'Consumer Price Index (CPI)' }
      }
    ],
    dataStructures: [
      {
        dataStructureComponents: {
          dimensionList: {
            dimensions: [
              {
                id: 'FREQ',
                position: 2,
                conceptIdentity: concept('FREQ'),
                localRepresentation: { enumeration: codelist('CL_FREQ') }
              },
              {
                id: 'MEASURE',
                position: 0,
                conceptIdentity: concept('MEASURE'),
                localRepresentation: { enumeration: codelist('CL_MEASURES') }
              },
              {
                id: 'REGION',
                position: 1,
                conceptIdentity: concept('REGION'),
                localRepresentation: { enumeration: codelist('CL_REGION') }
              }
            ],
            timeDimensions: [{ id: 'TIME_PERIOD' }]
          }
        }
      }
    ],
    codelists: [
      {
        id: 'CL_MEASURES',
        agencyID: 'ABS',
        codes: [
          { id: '1', name: 'Index numbers' },
          { id: '2', name: 'Percentage change from previous period' },
          { id: '3', name: 'Percentage change from corresponding quarter' }
        ]
      },
      {
        id: 'CL_REGION',
        agencyID: 'ABS',
        codes: [
          { id: '50', name: 'Australia' },
          { id: '1', name: 'Sydney' },
          { id: '9', name: 'Sydney' }
        ]
      },
      {
        id: 'CL_FREQ',
        agencyID: 'ABS',
        codes: [
          { id: 'A', name: 'Annual' },
          { id: 'M', name: 'Monthly' },
          { id: 'Q', name: 'Quarterly' }
        ]
      }
    ],
    conceptSchemes: [
      {
        id: 'CS_COMMON',
        concepts: [
          { id: 'MEASURE', name: 'Measure' },
          { id: 'FREQ', name: 'Frequency' }
        ]
      }
    ]
  }
};

const availability: SdmxAvailability = {
  data: {
    contentConstraints: [
      {
        cubeRegions: [
          {
            keyValues: [
              { id: 'MEASURE', values: ['3', '1'] },
              { id: 'REGION', values: ['50', '1', '9', '77'] },
              { id: 'FREQ', values: ['Q', 'M'] },
              {
                id: 'TIME_PERIOD',
                timeRange: {
                  startPeriod: { period: '2026-07-01T00:00:00' },
                  endPeriod: { period: '2026-09-30T00:00:00' }
                }
              }
            ]
          }
        ]
      }
    ]
  }
};

describe('toTableDocs', () => {
  it('lists flows with safe ids by their name in the language', () => {
    expect(
      toTableDocs(
        {
          data: {
            dataflows: [
              {
                id: 'CPI',
                version: '2.0.0',
                agencyID: 'ABS',
                name: 'CPI',
                names: { en: 'Consumer Price Index (CPI)' }
              },
              {
                id: 'LF',
                version: '1.0.0',
                agencyID: 'ABS',
                name: 'Labour Force'
              },
              { id: 'NO_NAME', version: '1.0.0', agencyID: 'ABS' },
              { id: 'BAD/ID', version: '1.0.0', agencyID: 'ABS', name: 'x' }
            ]
          }
        },
        'en'
      )
    ).toEqual([
      { id: 'CPI', title: 'Consumer Price Index (CPI)' },
      { id: 'LF', title: 'Labour Force' },
      { id: 'NO_NAME', title: 'NO_NAME' }
    ]);
  });
});

describe('toTableStructure', () => {
  it('lists dimensions in key order with only available codes, then the periods', () => {
    const table = toTableStructure(structure, availability, 'en');

    expect(table.version).toBe('2.0.0');
    expect(table.dimensionIds).toEqual(['MEASURE', 'REGION', 'FREQ']);
    expect(table.metadata.title).toBe('Consumer Price Index (CPI)');
    expect(
      table.metadata.variables.map((variable) => [
        variable.code,
        variable.label,
        variable.values,
        variable.valueLabels,
        variable.isTime
      ])
    ).toEqual([
      [
        'MEASURE',
        'Measure',
        ['1', '3'],
        ['Index numbers', 'Percentage change from corresponding quarter'],
        false
      ],
      [
        'REGION',
        'REGION',
        ['50', '1', '9', '77'],
        ['Australia', 'Sydney (1)', 'Sydney (9)', '77'],
        false
      ],
      ['FREQ', 'Frequency', ['M', 'Q'], ['Monthly', 'Quarterly'], false],
      [
        'TIME_PERIOD',
        'Time period',
        ['2026-Q3', '2026-07', '2026-08', '2026-09'],
        ['2026-Q3', '2026-07', '2026-08', '2026-09'],
        true
      ]
    ]);
  });

  it('shows every code and no periods when availability is missing', () => {
    const table = toTableStructure(structure, undefined, 'en');

    expect(table.metadata.variables.map((variable) => variable.values)).toEqual(
      [['1', '2', '3'], ['50', '1', '9'], ['A', 'M', 'Q'], []]
    );
  });

  it('marks the periods as incomplete when availability is missing', () => {
    const table = toTableStructure(structure, undefined, 'en');

    expect(table.metadata.variables.at(-1)?.periodsIncomplete).toBe(true);
  });

  it('uses annual periods for a table without a FREQ dimension', () => {
    const census: SdmxStructure = {
      data: {
        ...structure.data,
        dataStructures: [
          {
            dataStructureComponents: {
              dimensionList: {
                dimensions: [
                  {
                    id: 'REGION',
                    position: 0,
                    localRepresentation: { enumeration: codelist('CL_REGION') }
                  }
                ]
              }
            }
          }
        ]
      }
    };
    const range: SdmxAvailability = {
      data: {
        contentConstraints: [
          {
            cubeRegions: [
              {
                keyValues: [
                  {
                    id: 'TIME_PERIOD',
                    timeRange: {
                      startPeriod: { period: '2011-01-01T00:00:00' },
                      endPeriod: { period: '2013-12-31T00:00:00' }
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    expect(
      toTableStructure(census, range, 'en').metadata.variables.at(-1)?.values
    ).toEqual(['2011', '2012', '2013']);
  });
});

const metadata = toTableStructure(structure, availability, 'en').metadata;
const unit = { id: 'IN', name: 'Index Numbers' };

function message(
  overrides: Partial<SdmxDataMessage['data']['structure']> = {},
  dataSet: SdmxDataMessage['data']['dataSets'][number] = {
    series: {
      '0:0:0': {
        attributes: [0],
        observations: { '0': [103.64], '1': [102.31] }
      },
      '0:1:0': {
        attributes: [null],
        observations: { '0': [103.71], '1': [null] }
      }
    }
  }
): SdmxDataMessage {
  return {
    data: {
      structure: {
        dimensions: {
          dataset: [],
          series: [
            {
              id: 'MEASURE',
              keyPosition: 0,
              values: [{ id: '1', name: 'Index numbers' }]
            },
            {
              id: 'REGION',
              keyPosition: 1,
              values: [
                { id: '50', name: 'Australia' },
                { id: '1', name: 'Sydney' }
              ]
            },
            {
              id: 'FREQ',
              keyPosition: 2,
              values: [{ id: 'Q', name: 'Quarterly' }]
            }
          ],
          observation: [
            {
              id: 'TIME_PERIOD',
              values: [
                { id: '2026-Q3', name: '2026-Q3' },
                { id: '2026-Q2', name: '2026-Q2' }
              ]
            }
          ]
        },
        attributes: { series: [{ id: 'UNIT_MEASURE', values: [unit] }] },
        ...overrides
      },
      dataSets: [dataSet]
    }
  };
}

describe('toFlatTable', () => {
  it('gives one row per observation, oldest first, with metadata labels and the unit', () => {
    expect(toFlatTable(message(), metadata, 'en')).toEqual({
      label: 'Consumer Price Index (CPI)',
      columns: [
        'Measure',
        'REGION',
        'Frequency',
        'Time period',
        'Value',
        'Unit'
      ],
      rows: [
        [
          'Index numbers',
          'Australia',
          'Quarterly',
          '2026-Q2',
          102.31,
          'Index Numbers'
        ],
        [
          'Index numbers',
          'Australia',
          'Quarterly',
          '2026-Q3',
          103.64,
          'Index Numbers'
        ],
        ['Index numbers', 'Sydney (1)', 'Quarterly', '2026-Q2', null, null],
        ['Index numbers', 'Sydney (1)', 'Quarterly', '2026-Q3', 103.71, null]
      ]
    });
  });

  it('keeps only the asked periods', () => {
    const table = toFlatTable(message(), metadata, 'en', new Set(['2026-Q3']));

    expect(table.rows.map((row) => row[3])).toEqual(['2026-Q3', '2026-Q3']);
  });

  it('reads a dimension and a unit given once for the whole data set', () => {
    const table = toFlatTable(
      message(
        {
          dimensions: {
            dataset: [
              {
                id: 'FREQ',
                keyPosition: 2,
                values: [{ id: 'Q', name: 'Quarterly' }]
              }
            ],
            series: [
              {
                id: 'MEASURE',
                keyPosition: 0,
                values: [{ id: '1', name: 'Index numbers' }]
              }
            ],
            observation: [{ id: 'TIME_PERIOD', values: [{ id: '2026-Q3' }] }]
          },
          attributes: { dataSet: [{ id: 'UNIT_MEASURE', values: [unit] }] }
        },
        { attributes: [0], series: { '0': { observations: { '0': [1.5] } } } }
      ),
      metadata,
      'en'
    );

    expect(table).toEqual({
      label: 'Consumer Price Index (CPI)',
      columns: ['Measure', 'Frequency', 'Time period', 'Value', 'Unit'],
      rows: [['Index numbers', 'Quarterly', '2026-Q3', 1.5, 'Index Numbers']]
    });
  });

  it('reads a unit given per observation', () => {
    const table = toFlatTable(
      message(
        {
          attributes: {
            observation: [
              { id: 'OBS_STATUS', values: [{ id: 'p', name: 'Provisional' }] },
              { id: 'UNIT_MEASURE', values: [unit] }
            ]
          }
        },
        {
          series: {
            '0:0:0': { observations: { '0': [103.64, 0, 0] } }
          }
        }
      ),
      metadata,
      'en'
    );

    expect(table.rows).toEqual([
      [
        'Index numbers',
        'Australia',
        'Quarterly',
        '2026-Q3',
        103.64,
        'Index Numbers'
      ]
    ]);
  });

  it('has no unit column when the message has no unit', () => {
    const table = toFlatTable(message({ attributes: {} }), metadata, 'en');

    expect(table.columns).not.toContain('Unit');
    expect(table.rows[0]).toHaveLength(5);
  });
});

describe('response schemas', () => {
  it.each([
    [
      'dataflows',
      dataflowsSchema,
      {
        data: {
          dataflows: [
            {
              id: 'CPI',
              version: '2.0.0',
              agencyID: 'ABS',
              isFinal: true,
              name: 'CPI',
              annotations: [{ type: 'NonProductionDataflow', text: 'true' }]
            }
          ]
        }
      }
    ],
    ['structure', structureSchema, structure],
    ['availability', availabilitySchema, availability],
    [
      'data message',
      dataMessageSchema,
      {
        meta: { id: 'IREF1' },
        data: {
          dataSets: [
            {
              action: 'Information',
              attributes: null,
              series: {
                '0': {
                  attributes: [0],
                  annotations: [],
                  observations: { '0': [97.7, null] }
                }
              }
            }
          ],
          structure: {
            dimensions: {
              dataset: [],
              series: [
                {
                  id: 'REGION',
                  keyPosition: 0,
                  roles: ['REGION'],
                  values: [
                    { id: '50', order: 0, name: 'Australia', parent: 'x' }
                  ]
                }
              ],
              observation: [
                {
                  id: 'TIME_PERIOD',
                  values: [
                    {
                      start: '2026-07-01T00:00:00',
                      id: '2026-Q3',
                      name: '2026-Q3'
                    }
                  ]
                }
              ]
            },
            attributes: { dataSet: [], series: [], observation: [] }
          }
        }
      }
    ]
  ])('accepts an ABS %s response with extra fields', (_name, schema, body) => {
    expect(schema.safeParse(body).success).toBe(true);
  });
});

describe('toFlatTable values and units', () => {
  it.each([
    [[1.5], 1.5],
    [['2.25'], 2.25],
    [['n.p.'], null],
    [[''], null],
    [[null], null]
  ])('reads the value %j as %j', (observation, expected) => {
    const table = toFlatTable(
      message(
        {},
        { series: { '0:0:0': { observations: { '0': observation } } } }
      ),
      metadata,
      'en'
    );

    expect(table.rows[0]?.[4]).toBe(expected);
  });

  it('keeps the data-set unit when a series has no unit of its own', () => {
    const table = toFlatTable(
      message(
        {
          attributes: {
            dataSet: [{ id: 'UNIT_MEASURE', values: [unit] }],
            series: [
              { id: 'UNIT_MEASURE', values: [{ id: 'PC', name: 'Percent' }] }
            ]
          }
        },
        {
          attributes: [0],
          series: {
            '0:0:0': { attributes: [0], observations: { '0': [1] } },
            '0:1:0': { attributes: [null], observations: { '0': [2] } }
          }
        }
      ),
      metadata,
      'en'
    );

    expect(table.rows.map((row) => row[5])).toEqual([
      'Percent',
      'Index Numbers'
    ]);
  });
});
