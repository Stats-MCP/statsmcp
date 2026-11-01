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

Each search case lists the accepted search languages with keywords for each. Native-language questions also accept an English search, because English titles often find the same table. So `lang` fails only for a language the case does not accept.

Floors: `tool` and `tableId` must stay at 100 %. The other scorers allow one miss in a new recording.

## Replay (default, CI)

Model answers are saved in `recordings/`, one file per request. The tests replay them and make no network calls. If there are no recordings for the model, the eval test is skipped. With recordings, the model must have floors in `floors.json`. Provider error answers are never saved.

```sh
pnpm --filter statsmcp-evals test
```

## Record

Recording calls the model on your computer. Run it only there, never in CI. By default it uses the Anthropic API with the model `claude-opus-5-5`.

1. Put your key in `apps/evals/.env` (git-ignored):

   ```sh
   ANTHROPIC_API_KEY=<key>
   ```

2. Build the packages (`pnpm build`), because the evals use the built servers. Then record and write the floors from the recordings:

   ```sh
   EVAL_MODE=record pnpm --filter statsmcp-evals test
   UPDATE_FLOORS=1 pnpm --filter statsmcp-evals test
   ```

For a new model, the first record run saves the recordings and then fails with "No floors for …". This is expected. The second command replays the recordings and writes the floors.

- Other providers: set `EVAL_PROVIDER=openai` with `OPENAI_API_KEY`, or `EVAL_PROVIDER=openrouter` with `OPENROUTER_API_KEY`. CI replays the default provider, so recordings for another provider also need that `EVAL_PROVIDER` in CI.
- To use another model, set `EVAL_MODEL`, for example `claude-haiku-5-5`. The defaults are in `PROVIDERS` in [`src/task.ts`](src/task.ts). Claude models get no `temperature`, because current models reject it.
- A change to a tool description, an input schema, the server instructions, a case, or the `ai`, `@ai-sdk/anthropic` or `@ai-sdk/openai` version changes the request. The Anthropic provider also takes `max_tokens` from its model table, so keep these versions pinned exactly. The old recordings then no longer match. Delete the model's folder in `recordings/` and record again.
- Commit the recordings and `floors.json` together.
- The endpoints in [`src/servers.ts`](src/servers.ts) must match the hosted routes in `apps/worker/src/index.ts`. Add a new country to both.
