# Agent evals

These evals measure what a model does with the real StatsMCP tools. For each case, the model gets one endpoint's instructions and tool list, and a user question. The scorers check the model's first tool call:

| Scorer     | Passes when                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `tool`     | The model calls the expected tool (`search_tables`, or `get_table_metadata` for a table id).              |
| `lang`     | The `lang` argument is the expected language. A missing `lang` counts as the endpoint's default language. |
| `keywords` | The search query contains one of the expected words.                                                      |
| `short`    | The search query has 1 to 6 words, not a full question.                                                   |
| `tableId`  | The model uses the table id from the question.                                                            |

The cases are in [`src/dataset.ts`](src/dataset.ts). The pass rate of each scorer must stay at or above its floor in `floors.json`.

## Replay (default, CI)

Model answers are saved in `recordings/`, one file per request. The tests replay them and make no network calls. If there are no recordings for the model, the eval test is skipped. With recordings, the model must have floors in `floors.json`. Provider error answers are never saved.

```sh
pnpm --filter statsmcp-evals test
```

## Record

Recording calls the model on your computer. Run it only there, never in CI. By default it uses the OpenAI API with the model `gpt-4.1-mini`.

```sh
EVAL_MODE=record OPENAI_API_KEY=<key> pnpm --filter statsmcp-evals test
UPDATE_FLOORS=1 pnpm --filter statsmcp-evals test   # write the new floors from the recordings
```

For a new model, the first record run saves the recordings and then fails with "No floors for …". This is expected. Run the second command to write the floors.

- To use [OpenRouter](https://openrouter.ai) for other model families, set `EVAL_PROVIDER=openrouter` and `OPENROUTER_API_KEY`. Replay in CI then also needs `EVAL_PROVIDER=openrouter`.
- To use another model, set `EVAL_MODEL`. The defaults are in `PROVIDERS` in [`src/task.ts`](src/task.ts).
- A change to a tool description, an input schema, the server instructions, a case, or the `ai` or `@ai-sdk/openai` version changes the request. The old recordings then no longer match. Delete the model's folder in `recordings/` and record again.
- Commit the recordings and `floors.json` together.
