import { describe, expect, it, vi } from 'vitest';

import {
  createEurostatClient,
  parseStructure,
  parseToc,
  periodsBetween
} from '@/eurostat-client';

const BASE_URL = 'https://estat.example/api/dissemination';

const toc = [
  '"title"\t"code"\t"type"\t"last update of data"\t"last table structure change"\t"data start"\t"data end"\t"values"',
  '"Economy"\t"economy"\t"folder"\t""\t""\t""\t""\t""',
  '"    HICP - monthly data (annual rate of change) (1997-2025)"\t"prc_hicp_manr"\t"dataset"\t"06.02.2026"\t"07.01.2026"\t"1997-01"\t"2025-12"\t"3511040"',
  '"    HICP - indices and rates of change, monthly data"\t"prc_hicp_minr"\t"dataset"\t"15.10.2026"\t"15.10.2026"\t"2026-07"\t"2026-09"\t"100"',
  '"  HICP - indices and rates of change, monthly data"\t"prc_hicp_minr"\t"dataset"\t"15.10.2026"\t"15.10.2026"\t"2026-07"\t"2026-09"\t"100"'
].join('\n');

const structure = `<?xml version="1.0"?><m:Structure>
<s:Concept id="geo"><c:Name xml:lang="en">Geopolitical entity</c:Name><c:Name xml:lang="de">Geopolitische Einheit</c:Name></s:Concept>
<s:Concept id="unit"><c:Name xml:lang="en">Unit of measure</c:Name></s:Concept>
<s:Codelist agencyID="ESTAT" id="GEO" isPartial="true"><s:Code id="SI"><c:Annotations><c:Annotation><c:AnnotationText xml:lang="en">note</c:AnnotationText></c:Annotation></c:Annotations><c:Name xml:lang="en">Slovenia</c:Name><c:Name xml:lang="de">Slowenien</c:Name></s:Code><s:Code id="AT"><c:Name xml:lang="en">Austria</c:Name></s:Code></s:Codelist>
<s:Codelist agencyID="ESTAT" id="UNIT"><s:Code id="RCH_A"><c:Name xml:lang="en">Annual rate of change &amp; more</c:Name></s:Code></s:Codelist>
<s:Dimension id="geo" position="2"><s:LocalRepresentation><s:Enumeration><Ref agencyID="ESTAT" class="Codelist" id="GEO" package="codelist"/></s:Enumeration></s:LocalRepresentation></s:Dimension>
<s:Dimension id="unit" position="1"><s:LocalRepresentation><s:Enumeration><Ref agencyID="ESTAT" class="Codelist" id="UNIT"/></s:Enumeration></s:LocalRepresentation></s:Dimension>
<s:TimeDimension id="TIME_PERIOD" position="3"></s:TimeDimension>
</m:Structure>`;

const dataset = {
  class: 'dataset',
  label: 'HICP',
  id: ['unit', 'geo', 'time'],
  size: [1, 1, 2],
  dimension: {
    unit: {
      label: 'Unit of measure',
      category: {
        index: { RCH_A: 0 },
        label: { RCH_A: 'Annual rate of change' }
      }
    },
    geo: {
      label: 'Geopolitical entity',
      category: { index: { SI: 0 }, label: { SI: 'Slovenia' } }
    },
    time: { label: 'Time', category: { index: { '2026-08': 0, '2026-09': 1 } } }
  },
  value: { '0': 3.4, '1': 3.7 }
};

function text(body: string, status = 200): Response {
  return new Response(body, { status });
}

function router(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/catalogue/toc/')) return text(toc);
    if (url.includes('/sdmx/2.1/dataflow/')) return text(structure);
    if (url.includes('/statistics/1.0/data/'))
      return text(JSON.stringify(dataset));
    return text('', 404);
  });
}

describe('periodsBetween', () => {
  it.each([
    ['2024', '2026', ['2024', '2025', '2026']],
    ['2025-11', '2026-02', ['2025-11', '2025-12', '2026-01', '2026-02']],
    ['2025-Q4', '2026-Q2', ['2025-Q4', '2026-Q1', '2026-Q2']],
    ['2025-S2', '2026-S1', ['2025-S2', '2026-S1']],
    ['2026-W01', '2026-W03', ['2026-W03']]
  ])('lists the periods from %s to %s', (start, end, expected) => {
    expect(periodsBetween(start, end)).toEqual(expected);
  });
});

describe('parseToc and parseStructure', () => {
  it('keeps datasets and tables with ISO update dates', () => {
    expect(parseToc(toc)[1]).toEqual({
      code: 'prc_hicp_minr',
      title: 'HICP - indices and rates of change, monthly data',
      updated: '2026-10-15',
      start: '2026-07',
      end: '2026-09'
    });
  });

  it('reads self-closing codes and decodes numeric entities', () => {
    const xml = `<s:Concept id="geo"><c:Name xml:lang="en">Geo</c:Name></s:Concept>
<s:Codelist id="GEO"><s:Code id="XX"/><s:Code id="SI"><c:Name xml:lang="en">Sloveni&#x0061; &#8364;</c:Name></s:Code></s:Codelist>
<s:Dimension id="geo" position="1"><Ref class="Codelist" id="GEO"/></s:Dimension>`;

    expect(parseStructure(xml, 'en').dimensions[0]?.codes).toEqual([
      { id: 'XX', label: 'XX' },
      { id: 'SI', label: 'Slovenia €' }
    ]);
  });

  it('orders dimensions by position and reads names in the asked language', () => {
    expect(parseStructure(structure, 'de').dimensions).toEqual([
      {
        id: 'unit',
        label: 'Unit of measure',
        codes: [{ id: 'RCH_A', label: 'Annual rate of change & more' }]
      },
      {
        id: 'geo',
        label: 'Geopolitische Einheit',
        codes: [
          { id: 'SI', label: 'Slowenien' },
          { id: 'AT', label: 'Austria' }
        ]
      }
    ]);
  });
});

describe('createEurostatClient', () => {
  it('searches the table of contents once per table and ranks closed series last', async () => {
    const client = createEurostatClient({
      baseUrl: BASE_URL,
      fetch: router(),
      now: () => new Date('2026-11-01')
    });

    const hits = await client.search('en', 'HICP monthly');

    expect(hits.map((hit) => [hit.tableId, hit.archived ?? false])).toEqual([
      ['prc_hicp_minr', false],
      ['prc_hicp_manr', true]
    ]);
  });

  it('builds metadata from the structure and the period range of the table of contents', async () => {
    const client = createEurostatClient({ baseUrl: BASE_URL, fetch: router() });

    const metadata = await client.getMetadata('en', 'prc_hicp_minr');

    expect(metadata.title).toBe(
      'HICP - indices and rates of change, monthly data'
    );
    expect(
      metadata.variables.map((variable) => [
        variable.code,
        variable.values,
        variable.isTime
      ])
    ).toEqual([
      ['unit', ['RCH_A'], false],
      ['geo', ['SI', 'AT'], false],
      ['time', ['2026-07', '2026-08', '2026-09'], true]
    ]);
  });

  it('reports a code that is not in the table of contents as not found', async () => {
    const client = createEurostatClient({ baseUrl: BASE_URL, fetch: router() });

    await expect(client.getMetadata('en', 'nope_x')).rejects.toMatchObject({
      status: 404
    });
  });

  it('sends repeated codes, lastTimePeriod for the latest periods and nothing for all values', async () => {
    const fetchMock = router();
    const client = createEurostatClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    const table = await client.query('en', 'prc_hicp_minr', [
      { code: 'geo', selection: { filter: 'item', values: ['SI', 'AT'] } },
      { code: 'unit', selection: { filter: 'all', values: ['*'] } },
      { code: 'time', selection: { filter: 'top', values: ['2'] } }
    ]);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${BASE_URL}/statistics/1.0/data/prc_hicp_minr?lang=en&geo=SI&geo=AT&lastTimePeriod=2`
    );
    expect(table.rows).toEqual([
      ['Annual rate of change', 'Slovenia', '2026-08', 3.4],
      ['Annual rate of change', 'Slovenia', '2026-09', 3.7]
    ]);
  });

  it('sends the last codes for latest on a variable that is not time', async () => {
    const fetchMock = router();
    const client = createEurostatClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    await client.query('en', 'prc_hicp_minr', [
      { code: 'geo', selection: { filter: 'top', values: ['1'] } }
    ]);

    const dataUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes('/statistics/1.0/data/'));
    expect(dataUrl).toBe(
      `${BASE_URL}/statistics/1.0/data/prc_hicp_minr?lang=en&geo=AT`
    );
  });

  it('fails with a bad gateway on an empty table of contents and does not keep it', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      text('<html>maintenance</html>')
    );
    const client = createEurostatClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    await expect(client.search('en', 'HICP')).rejects.toMatchObject({
      status: 502
    });
    await expect(client.search('en', 'HICP')).rejects.toMatchObject({
      status: 502
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads the table of contents once for parallel and repeated searches', async () => {
    const fetchMock = router();
    const client = createEurostatClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    await Promise.all([
      client.search('en', 'HICP'),
      client.search('en', 'monthly')
    ]);
    await client.search('en', 'prices');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a dataset that the data API does not know as not found', async () => {
    const client = createEurostatClient({
      baseUrl: BASE_URL,
      fetch: async () => text('{"error":"not found"}', 404)
    });

    await expect(
      client.query('en', 'prc_hicp_minr', [
        { code: 'time', selection: { filter: 'top', values: ['1'] } }
      ])
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('not found')
    });
  });

  it('keeps the invalid id message for metadata', async () => {
    const client = createEurostatClient({ baseUrl: BASE_URL, fetch: router() });

    await expect(client.getMetadata('en', 'a/b')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Invalid table id')
    });
  });

  it.each(['../x', 'prc hicp', 'a/b'])(
    'rejects the code %s without a request',
    async (code) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createEurostatClient({
        baseUrl: BASE_URL,
        fetch: fetchMock
      });

      await expect(client.query('en', code, [])).rejects.toMatchObject({
        status: 400
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
