# Feature-flag simplification: LLM delegation handoff

**Implementation complete (see [progress.md](./progress.md)).** Keep this for re-running or extending the work; the prompts below still describe the full procedure. [progress.md](./progress.md) is the resume point, [plan.md](./plan.md) defines the tasks, the [specs](./specs/00-target-behavior.md) give exact edits, and [acceptance-test.md](./acceptance-test.md) defines the evidence.

## Copyable assignment (whole package)

```text
Implement the approved feature-flag simplification in
`docs/feature-flags-simplification/`.

Read, completely and in this order: progress.md, plan.md,
specs/00-target-behavior.md, specs/01-server-recipes.md,
specs/02-client-recipes.md, specs/03-build-tests-docs.md,
acceptance-test.md, operations.md and this handoff.

Execute FF-00 through FF-07 strictly in order. After each task:
1. run that task's self-check command from plan.md,
2. run npm run lint, npm run typecheck, npm run test:unit (Node 22),
3. append an evidence entry to progress.md,
4. continue with the next task without asking me.

Target: one build that contains every feature; no pandablog.modules.json,
no __PB_MODULE_*/__PB_BLOCK_* constants, no configurator. Every block type
always renders. Graph view and publishing heatmap become public settings
(default on). Analytics, security alerts and logging use their existing
runtime settings. Single-user mode and history-collapsing code are deleted.
A leftover manifest only prints a build warning.

Rules:
- Never edit server/utils/schema.surql.
- Never use my .env, storage/, configured DB, accounts or containers.
- Do not add other flags, settings or environment variables.
- Do not weaken auth/CSRF/role/privacy checks or bounds/timeouts.
- Delete only tests of retired behavior (listed in spec 03 §5.2);
  keep runtime-setting, auth and safety tests.
- Do not commit, push or deploy. Preserve unrelated dirty files.
- Stop and record a question in progress.md only for a decision not
  covered by plan.md §2.

At the end report: changed/deleted files, deleted test cases per file,
exact verification results, blocked acceptance rows and next action.
State that no user data or deployment was touched.
```

## Copyable assignment (one task at a time, for small context windows)

If the implementing model has a small context window, send one task per session:

```text
Read docs/feature-flags-simplification/progress.md and plan.md §3 (the
replacement rule) and §8 (safety rules). Then implement ONLY task FF-0X
from plan.md §6, using the spec sections it links. Follow the recipes
literally; search for the quoted text because line numbers are hints.
Run the task's self-check, then npm run lint, npm run typecheck and
npm run test:unit. Append an evidence entry to progress.md and mark the
task done or blocked. Do not start the next task.
```

Replace `FF-0X` with the next "not started" task from progress.md.

## Tips for smaller models

- **Search, don't trust line numbers.** Example: `rg -n "__PB_MODULE_MFA__" server`. Edit the exact matched text.
- **One file at a time.** After each file, run `npx eslint <file>` to catch unused imports and syntax errors early.
- **Vue templates:** removing `v-if="flag"` must keep the element; removing a `v-else-if` component condition must keep the `node.type === '...'` part.
- **Brackets:** when unwrapping `if (FLAG) { ... }`, delete exactly one opening line and its matching `}`. Run `npm run typecheck` immediately afterwards.
- **Spread arrays:** `...(FLAG ? [A, B] : [])` becomes `A, B`. Keep the trailing comma that separates it from the next item.
- **Never** fix a failing test by loosening an assertion that is about auth, bounds, timeouts or data safety. If a test fails only because it asserted retired behavior (for example "404 when the module is disabled"), delete that case and record it.
- If typecheck reports `Cannot find name '__PB_...'` after FF-06, a consumer was missed. Fix the consumer; do not re-add the declaration.

## When to stop

Stop only for:

- a new security/privacy or data-deletion decision not in plan §2,
- a required runtime (Node 22, SurrealDB 3.2.x, browser) that is unavailable, after doing all independent work.

Routine choices such as helper naming, test structure, translation wording and import paths are not stop points.
