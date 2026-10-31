# Examples

These examples are real calls to `sistat-mcp`, recorded on 31 October 2026. The values change when SURS publishes new data.

Each example shows a question that a user can ask, the tool calls that an assistant makes, and the result.

## 1. Find a table (`search_tables`)

**Question:** "What is the latest inflation rate in Slovenia?"

```json
{
  "name": "search_tables",
  "arguments": { "query": "consumer price index", "lang": "en", "limit": 6 }
}
```

```text
11 tables match; showing 6.
0400609S.px | Harmonised index of consumer prices (ECOICOP ver. 2), Slovenia, monthly | 2026-10-05
0400608S.px | Consumer price indices (ECOICOP ver. 2), Slovenia, monthly | 2026-10-05
0400610S.px | Harmonised index of consumer prices at constant tax rates (ECOICOP ver. 2), Slovenia, monthly | 2026-10-05
H173S.px | Price indices by types of price indices, Slovenia, annually | 2026-06-23
H281S.px | Inflation, Slovenia, monthly | 2026-10-28
0400601S.px | Consumer price indices by COICOP/HICP by groups and subgroups, Slovenia, 2000M01 - 2016M12 | 2022-01-24

Source: SURS (Statistical Office of the Republic of Slovenia)
```

Tips:

- Use short topic words, for example `consumer price index`. Do not use full questions.
- Look at the date at the end of each line. A title that ends with a year range, for example `2000M01 - 2016M12`, contains only historical data.
- If the results are poor, search in the other language.

## 2. Read the variables of a table (`get_table_metadata`)

```json
{
  "name": "get_table_metadata",
  "arguments": { "tableId": "H281S.px", "lang": "en" }
}
```

```text
Table H281S.px: Inflation by MONTH and INDEX
- MESEC "MONTH" (430 values, time, required)
  1991M01; 1991M02; 1991M03; 1991M04; 1991M05; 1991M06; 1991M07; 1991M08; 1991M09; 1991M10; … 415 more …; 2026M06; 2026M07; 2026M08; 2026M09; 2026M10
- INDEKS "INDEX" (3 values, required)
  1=Monthly index (month / previous month); 2=Annual index (month / same month of the previous year); 3=Average annual index (average in year / average of the same months of the previous year)

Optional variables can be left out; the result then shows their total. Required variables left out return all their values.

Source: SURS (Statistical Office of the Republic of Slovenia), table H281S.px: https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/H281S.px
```

### Find a value by name (`valueFilter`)

A table can have more than 200 municipalities. Use `valueFilter` to find the code of one municipality.

```json
{
  "name": "get_table_metadata",
  "arguments": {
    "tableId": "05C4008S.px",
    "lang": "en",
    "valueFilter": "Maribor"
  }
}
```

```text
Table 05C4008S.px: Population - selected indicators by MUNICIPALITIES, HALF-YEAR, SEX and INDICATOR
- OBČINE "MUNICIPALITIES" (213 values, required)
  070=Maribor
- POLLETJE "HALF-YEAR" (54 values, time, required)
  no values match "Maribor"
- SPOL "SEX" (3 values, required)
  no values match "Maribor"
- KAZALNIK "INDICATOR" (9 values, required)
  no values match "Maribor"
```

The filter applies to all variables. To see the values of the other variables, call `get_table_metadata` again without `valueFilter`.

## 3. Get data (`query_table`)

### Inflation in the last 6 months

```json
{
  "name": "query_table",
  "arguments": {
    "tableId": "H281S.px",
    "lang": "en",
    "selections": [
      { "code": "MESEC", "latest": 6 },
      { "code": "INDEKS", "values": ["2"] }
    ]
  }
}
```

```text
Inflation by MONTH and INDEX. 6 rows.

MONTH,INDEX,Value
2026M05,Annual index (month / same month of the previous year),103.6
2026M06,Annual index (month / same month of the previous year),103.6
2026M07,Annual index (month / same month of the previous year),102.9
2026M08,Annual index (month / same month of the previous year),103
2026M09,Annual index (month / same month of the previous year),103.3
2026M10,Annual index (month / same month of the previous year),103.3

Source: SURS (Statistical Office of the Republic of Slovenia), table H281S.px: https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/H281S.px
```

An annual index of 103.3 means that prices were 3.3% higher than in the same month of the previous year.

### Average gross and net pay

**Question:** "What is the average salary in Slovenia?"

```json
{
  "name": "query_table",
  "arguments": {
    "tableId": "H285S.px",
    "lang": "en",
    "selections": [
      { "code": "MESEC", "latest": 3 },
      { "code": "PLAČE", "values": ["1", "2"] }
    ]
  }
}
```

```text
Average monthly earnings by MONTH and EARNINGS. 6 rows.

MONTH,EARNINGS,Value
2026M06,Gross earnings,2751.37
2026M06,Net earnings,1723.31
2026M07,Gross earnings,2708.63
2026M07,Net earnings,1695.34
2026M08,Gross earnings,2695.56
2026M08,Net earnings,1688.55

Source: SURS (Statistical Office of the Republic of Slovenia), table H285S.px: https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/H285S.px
```

### Compare two municipalities

**Question:** "Is the population of Maribor older than the population of Ljubljana?"

```json
{
  "name": "query_table",
  "arguments": {
    "tableId": "05C4008S.px",
    "lang": "en",
    "selections": [
      { "code": "OBČINE", "values": ["061", "070"] },
      { "code": "POLLETJE", "latest": 1 },
      { "code": "SPOL", "values": ["0"] },
      { "code": "KAZALNIK", "values": ["1", "2", "5"] }
    ]
  }
}
```

```text
Population - selected indicators by MUNICIPALITIES, HALF-YEAR, SEX and INDICATOR. 6 rows.

MUNICIPALITIES,HALF-YEAR,SEX,INDICATOR,Value
Ljubljana,2026H1,Sex - TOTAL,Mean age [years],43.2
Ljubljana,2026H1,Sex - TOTAL,Ageing index,152.7
Ljubljana,2026H1,Sex - TOTAL,Proportion of population aged 65 or more [%],20.5
Maribor,2026H1,Sex - TOTAL,Mean age [years],45.3
Maribor,2026H1,Sex - TOTAL,Ageing index,194
Maribor,2026H1,Sex - TOTAL,Proportion of population aged 65 or more [%],24

Source: SURS (Statistical Office of the Republic of Slovenia), table 05C4008S.px: https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/05C4008S.px
```

### Slovenian labels

Set `lang` to `sl` to get Slovenian labels and the Slovenian source line. The table title comes from the API as it is.

```json
{
  "name": "query_table",
  "arguments": {
    "tableId": "H281S.px",
    "lang": "sl",
    "selections": [
      { "code": "MESEC", "latest": 3 },
      { "code": "INDEKS", "values": ["2"] }
    ]
  }
}
```

```text
Indeks inflacije po: MESEC ,  INDEKS. 3 rows.

MESEC,INDEKS,Value
2026M08,Letni indeks (mesec / isti mesec prejšnjega leta),103
2026M09,Letni indeks (mesec / isti mesec prejšnjega leta),103.3
2026M10,Letni indeks (mesec / isti mesec prejšnjega leta),103.3

Vir: SURS (Statistični urad Republike Slovenije), table H281S.px: https://pxweb.stat.si/SiStatData/pxweb/sl/Data/-/H281S.px
```

### A query that is too large

If a query has too many cells, the server does not send it to SURS. It tells the assistant which variables to make smaller.

```json
{
  "name": "query_table",
  "arguments": {
    "tableId": "05C4008S.px",
    "lang": "en",
    "selections": [
      { "code": "SPOL", "values": ["0"] },
      { "code": "KAZALNIK", "values": ["1"] }
    ]
  }
}
```

```text
The query would return 11502 cells, above the limit of 5000. Select fewer values for MUNICIPALITIES (213 values), HALF-YEAR (54 values), SEX (1 values).
```

## Questions to try

You can ask an assistant these questions when the server is connected:

- "What was the annual inflation in Slovenia in each month of 2026?"
- "Compare the average net pay in the public and private sector over the last year." (table `0701015S.px`)
- "Which statistical region has the highest share of people aged 65 or more?"
- "How many tourist overnight stays were there in Slovenia last month?" (table `2164433S.px`)
- "Kakšna je povprečna starost prebivalcev v občini Koper?"
