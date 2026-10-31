# Tools

The server has three tools. All tools are read-only. Each tool accepts `lang`, the language of titles and labels. For SiStat, `lang` is `sl` or `en`. The default is the first language of the preset (`sl` for SiStat).

An assistant usually calls the tools in this order:

1. `search_tables` finds a table.
2. `get_table_metadata` shows the variables and value codes of the table.
3. `query_table` gets the data.

For real calls and results, refer to [examples.md](examples.md).

## `search_tables`

Finds tables by keywords in their titles.

| Argument | Type   | Description                                      |
| -------- | ------ | ------------------------------------------------ |
| `query`  | string | Keywords, for example `consumer price index`.    |
| `lang`   | string | Optional. Language of the titles.                |
| `limit`  | number | Optional. 1 to 50. The default is 10 for SiStat. |

Each result line has the table ID, the title and the publication date. Use short topic words, not full questions. A title that ends with a year range, for example `2000M01 - 2016M12`, contains only historical data.

## `get_table_metadata`

Lists the variables of a table and their value codes.

| Argument      | Type   | Description                                                                                                   |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `tableId`     | string | Table ID exactly as `search_tables` returns it, for example `H281S.px`. Some databases use IDs without `.px`. |
| `lang`        | string | Optional. Language of the labels.                                                                             |
| `valueFilter` | string | Optional. Shows only values whose label contains this text. Case-insensitive.                                 |

Each variable has one of these flags:

- `time`: the variable contains periods. Use `latest` in `query_table` for it.
- `optional`: if you leave out the variable, the result shows its total.
- `required`: if you leave out the variable, the result contains all its values.

A list with more than 30 values is shortened. Use `valueFilter` to find a value, for example a municipality. The filter shows a maximum of 50 matches for each variable.

## `query_table`

Returns data as CSV with readable labels.

| Argument     | Type   | Description                                  |
| ------------ | ------ | -------------------------------------------- |
| `tableId`    | string | Table ID from `search_tables`.               |
| `lang`       | string | Optional. Language of the labels.            |
| `selections` | array  | One entry for each variable that you filter. |

Each entry in `selections` has `code` and one of these two fields:

- `values`: a list of value codes from `get_table_metadata`.
- `latest`: a number N. The result contains the last N values. Use it for time variables.

One query can return a maximum of 5,000 cells for SiStat. If a query is larger, the server does not send it. The error names the variables with the most values, so the assistant can select fewer values.

## Errors

A tool error has `isError: true` and a message for the assistant. Examples:

- An unknown variable code or value code. The message lists the valid codes.
- A query that is too large.
- The statistics API limits the requests (HTTP 429). The message tells the assistant to wait and try again.
