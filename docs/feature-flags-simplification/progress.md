# Feature-flag simplification: progress and evidence

**Read first when resuming.** Requirements and tasks are in [plan.md](./plan.md). Exact edits are in the [specs](./specs/00-target-behavior.md). Verification is in [acceptance-test.md](./acceptance-test.md); operator guidance is in [operations.md](./operations.md); the delegation prompt is in [handoff.md](./handoff.md). Update this ledger at every checkpoint. Do not edit task definitions to imply progress.

## 1. Current state

- The user approved the recommended decisions ("go with recommendations"), then asked for implementation of FF-00 to FF-07 ("You can implement FF-00 to FF-07").
- **Status: FF-00 to FF-07 implemented in the working tree and verified locally. Not committed, not deployed.** No user `.env`, configured DB, `storage/`, `.output/`, accounts or containers were used by tests. The DB and production-build checks used owned temporary fixtures.
- Result: one build with every feature. There is no `pandablog.modules.json`, no `__PB_MODULE_*`/`__PB_BLOCK_*`, no configurator or print script, and no `runtimeConfig.public.modules`. Every block type always renders. Graph view and the publishing heatmap are runtime public settings (default on). A leftover manifest only prints a build warning.
- Size: `git diff --shortstat` → **100 tracked files changed, 427 insertions, 1,964 deletions**, plus 7 new paths (3 source, 3 tests, this docs folder). The deletions include docs/tests and the deleted machinery.

## 2. Task status

| Task | Status | Evidence / next action |
|---|---|---|
| FF-00 | done | Baseline `d878a57`, clean tree, Node 22.22.0. Lint pass; typecheck pass; bounded unit **114 files / 1,112 passed / 8 skipped** |
| FF-01 | done | Renderer unconditional; guard test added and passing |
| FF-02 | done | Editor/toolbar/settings/related-post flags removed; disabled dialogue view and i18n key deleted; annotate guard removed. Lint/typecheck/unit pass |
| FF-03 | done | Server always-on; single-user and history-collapse code deleted; schema stripping removed (`schema.surql` unchanged). Tests updated; guarded real DB pass |
| FF-04 | done | `graph_view_enabled`/`publish_heatmap_enabled` settings, `server/utils/publicFeatures.ts`, endpoint/page guards, General "Public features" UI (en/zh-CN), unit test |
| FF-05 | done | Layout, middleware, dashboards, security, login and versioning UI flags removed |
| FF-06 | done | Machinery deleted; package scripts, `.gitignore`, Dockerfile and `nuxt.config.ts` updated; legacy warning helper/module/test added |
| FF-07 | done locally | Harness collapsed to `full` with the new feature checks; README and dialogue cross-links updated; combined verification below. Remaining: E2E all-blocks parity (A2) is blocked on E2E credentials |

## 3. Decision register

| ID | Decision | State |
|---|---|---|
| FF-D01–D17 | See [plan §2](./plan.md#2-approved-decisions) | Approved and implemented |

No new product decision was required.

## 4. Deviations from the specs (all minor; contracts unchanged)

1. **`pages/graph.vue`** reads `useSiteSettings().graphViewEnabled` after `await usePublicBootstrap()` instead of indexing the bootstrap data directly. The direct form failed typecheck (`Record<string, unknown> | {}`). Spec 02 §3.4 was updated.
2. **Harness `maintenance-browser.ts`/`maintenance-app.ts`:** the formerly profile-gated sections became plain `{ ... }` blocks rather than being fully unwrapped, to avoid `const` name collisions (`labels`, `settings`, `anonymous`). The public-feature HTTP check lives in `maintenance-browser.ts`, where requests are authenticated (allowed by spec 03 §6.1 step 7). It checks the "Public features" heading in en/zh-CN and anonymous 404/200 for `/api/graph/overview`, `/api/posts/publish-frequency` and `/graph`.
3. **Harness explicit new-file list:** the harness copies only tracked files plus an explicit allow-list. The three new source files and three new tests were added to that list (spec 03 §6.1 step 8).
4. **`.gitignore`:** the repository ignores `tests/unit/*` except allow-listed files, so the three new tests were added to the allow-list (spec 03 §2.2).
5. **Tests converted instead of deleted, which keeps more coverage:**
   - `security-alerts-bounded` now asserts the runtime `security_alerts_enabled=false` path.
   - `current-identity` now asserts that every active account resolves with its own role.
   - `error-groups-api` keeps the missing-group 404.
   - `logging-dashboard` (not listed in spec 03) now asserts that both log overviews are always linked.
   - In `log-retention`, the settings-failure case now expects the audit entry, since the module gate is gone.
6. **Guard test budget:** `feature-flags-retired.test.ts`'s repository scan uses `readdir({ withFileTypes })` and an explicit 30 s per-test timeout. Under default full concurrency it exceeded the 5 s default.
7. **D4 (warning) evidence** used `nuxi prepare` (which runs module setup) in the repo with a temporary manifest, instead of a second full build. This avoids overwriting the user's existing `.output/`. The no-manifest production build is the owned harness build.

## 5. Evidence log

### 2026-10-10 FF-00 baseline

- Revision `d878a57`, clean application tree (only the new docs folder untracked).
- Node `v22.22.0` (explicit local executable placed first on `PATH` as `node`), Windows.
- `npm run lint`: pass (no style drift). `npm run typecheck`: pass. `npx vitest run --maxWorkers=4`: **114 files passed / 1 skipped; 1,112 passed / 8 skipped**, 47.9 s.

### 2026-10-10 FF-01 to FF-06 (incremental)

- After FF-01+FF-02: lint/typecheck pass; bounded unit 115 files / 1,113 passed.
- After FF-03: lint/typecheck pass; bounded unit 115 files / 1,097 passed.
- After FF-04+FF-05: one typecheck error in `pages/graph.vue` (deviation 1) and one retired-behavior dashboard test (deviation 5), both fixed. Then lint/typecheck pass; bounded unit 116 files / 1,104 passed.
- After FF-06: lint/typecheck pass; bounded unit **117 files / 1,109 passed / 8 skipped**.
- Self-check `rg "__PB_|pandablog-modules|moduleFlags|useModuleFlags|configure-modules|print-modules|modules:print|public\.modules"` over non-test, non-docs sources: only the harness `retiredSources` list and emitted-code regex remain (expected).

Deleted retired-behavior test cases (file: count):

| File | Deleted cases |
|---|---|
| `schema.test.ts` | 2 (strip helper; logs-disabled schema) |
| `error-groups-plugin.test.ts` | 3 (`build`/`logs`/`errors` disabled) |
| `log-retention-plugin.test.ts` | 2 (`build`/`runtime` module disabled) |
| `log-retention.test.ts` | 5 (module-flag stream skips ×2, module no-op ×2, activity-module audit suppression ×1) |
| `logging-error-capture.test.ts` | 1 (error module disabled) |
| `logging-error-hook.test.ts` | 3 (build flag off; runtime module ×2) |
| `access-log-retirement.test.ts` | 2 (legacy manifest `accessLogs` via the deleted normalizer; intent now covered by `legacy-module-manifest.test.ts`) |

Total: 18 deleted. 15 added (`feature-flags-retired` 2, `legacy-module-manifest` 6, `public-features-settings` 7). Five converted in place (deviation 5). 1,112 − 18 + 15 = **1,109**, which matches.

### 2026-10-10 FF-07 combined verification

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | pass, no style drift |
| Typecheck | `npm run typecheck` | pass |
| Unit (bounded) | `npx vitest run --maxWorkers=4` | **117 files passed / 1 skipped; 1,109 passed / 8 skipped**, 49.2 s |
| Unit (default workers) | `npx vitest run` | Run 1: only `annotate.test.ts` Japanese-dictionary 5 s timeout (known baseline flake). Run 2: that plus one `maintenance-crash.test.ts` timing failure. Both pass in isolation (`annotate` + `maintenance-crash`: **2 files / 17 passed**). No assertion or timeout of those tests was changed. Default concurrency remains the pre-existing open quality gate recorded in earlier ledgers |
| Guarded real DB | `node --import tsx scripts/backend-hardening/run.ts --fixture --surreal-bin=C:/Users/huipa/AppData/Local/Temp/pb-hardening-surreal-3.2.4.exe` | **13 files / 24 passed**, 144 s. SurrealDB `3.2.4+20260803.93ab219`, SDK 2.0.3 (schema bootstrap, backup/restore and rollback with the always-on schema) |
| Owned production build + browser | `node --import tsx scripts/backend-hardening/maintenance-app.ts --fixture --profile=full --mode=build --surreal-bin=<same>` | **pass**, 8 m 34 s. Owned typecheck + production build pass. Emitted-server scan: **5,539 entries / 14,806,764 bytes**, no `__PB_MODULE_`/`__PB_BLOCK_`. Browser en/zh-CN: admin, backups, logs and the new "Public features" heading; anonymous `/api/graph/overview`, `/api/posts/publish-frequency`, `/graph` → 404 when off and 200 when on. Ordinary crash/restart, destructive-restore fence, request IDs and access-history preservation all pass. A first attempt failed at owned typecheck because the new untracked files were not in the harness copy list (deviation 3); fixed and rerun |
| Legacy warning (D4) | temporary `pandablog.modules.json` with `analytics.enabled:false`, `users.multiUser:false`, `logs.accessLogs:false`, then `npx nuxi prepare` | Warning printed listing `modules.analytics.enabled` and `modules.users.multiUser` (accessLogs ignored); exit 0. The temporary manifest was removed. Without a manifest: no warning |
| Whitespace | `git diff --check` | clean |
| Line endings | `git ls-files --eol` on changed/new files | no `w/mixed` (one mixed file normalized to its original CRLF) |
| `schema.surql` unchanged | `git diff --quiet -- server/utils/schema.surql` | unchanged |

### Acceptance summary

- **Passed locally:** A1, A3 (registry exposes all definitions; production editor build), A4–A6, B1–B9, C1, C2, C4, C5 (API side), D1–D5, E.
- **Partially covered:** C3. The `/graph` 404 and API 404s are verified in the production build. The home/post widget `v-if` is verified by source and settings tests, but not visually in the browser fixture.
- **Blocked:** A2 (`tests/e2e/all-blocks-parity.spec.ts` against an owned app), which needs E2E credentials that earlier ledgers also recorded as unavailable. The renderer guard test, typecheck and the production build cover the code path, but the visual all-block render was not executed.

## 6. Handoff

- Ready for review. Suggested commit split if desired:
  - renderer/editor (FF-01/02)
  - server (FF-03)
  - public settings (FF-04)
  - admin UI (FF-05)
  - machinery removal + warning (FF-06)
  - harness/docs (FF-07)
- **Before deploying:** read [operations.md](./operations.md). The owner's former manifest enabled everything, so no runtime behavior changes except the two new toggles (default on).
- The existing `.output/` in the repo is a stale earlier build; rebuild before running locally.
- Next actions: run the E2E all-blocks parity spec when credentials are available. Optionally investigate the pre-existing default-concurrency timing flakes in their own scope.
