# Editor simplification: progress and decision ledger

> Read first on implementation/resume. [Plan](./plan.md) defines tasks; [specs](./specs/00-architecture.md) define requirements; [acceptance](./acceptance-test.md) defines evidence; [operations](./operations.md) describes target author/upgrade behaviour; [handoff](./handoff.md) supports whole-task delegation. Record status/evidence here, not in task definitions.

## 1. Current state

- **Approved direction:** the user's six-row option reduction table plus single-source Pinia inserter cleanup.
- **Implemented locally:** all six option reductions and single-source Pinia state are in the working tree. Shared normalization preserves content and removes targeted legacy presentation attrs at read/render/save boundaries without bulk writes. Final full-app acceptance remains incomplete.
- **Documentation baseline:** `b42eba92ead19b3528a50c1105b81e1e2862ab97`; initially clean working tree. Recheck before implementation.
- **Implementation authority:** user requested “Now implement it” and then explicitly confirmed ES-D08. No deployment/user-data operations are authorized.
- **Resolved decision:** ES-D08 confirmed by the user in the follow-up. Existing custom presentation normalizes to presets/site defaults; canonical attrs persist on the next ordinary save. No bulk/history rewrite.
- **Application evidence:** Node 22 lint/style-drift, production typecheck, targeted stylelint and 95 focused tests (including owned Chromium component/schema checks) pass. Bounded unit suite passes; default-concurrency timing failures and owned production-build timeout are recorded below. No real app/DB/user data used.
- **Next action:** complete visual/persistence integration and available owned schema/browser/build acceptance; record exact evidence and remaining gates.
- **Release status:** not approved. No real-data previews/backups/deployment/downgrade operated on.

## 2. Task status

| ID | Task | Status | Evidence / next work |
|---|---|---|---|
| ES-00 | Documentation and handoff | done | Nine-file package + three discovery/predecessor edits; local links/tasks/whitespace checked |
| ES-01 | Inventory and characterization | done (local) | Attr writers/readers mapped, ES-D08 confirmed, state failures characterized; legacy fixtures and schema/browser regressions added |
| ES-02 | One inserter state source | in-progress | Code and component/store regressions implemented; actual browser/mobile/swipe verification pending |
| ES-03 | Image presets and sources | in-progress | Code/pure/schema/component/browser geometry and fallback pass; full-app upload/private-media/version acceptance pending |
| ES-04 | Layouts and site presentation | in-progress | Code and functional schema/settings checks pass; full-app code/maths/tabs/accordion/theme parity acceptance pending |
| ES-05 | Integration and final evidence | blocked (partial) | Targeted quality/browser/bounded units pass; production Nitro bundling timed out, actual app/DB/version acceptance not run |

Statuses: `todo`, `in-progress`, `blocked`, `done`. A code task is done only with its required local evidence; it is never deployment approval.

## 3. Decisions and scope interpretations

| ID | Status | Contract |
|---|---|---|
| ES-D01 | approved direction | Image size presets replace arbitrary dimension/mode/aspect/free-resize choices; preserve aspect ratio |
| ES-D02 | approved direction | Automatic image resolution replaces author source-size selection |
| ES-D03 | approved direction | Bounded layout presets replace manual column proportions |
| ES-D04 | approved direction | Site spacing replaces arbitrary margins/padding/gaps |
| ES-D05 | approved direction | Site quote typography/colours; a few named structural styles |
| ES-D06 | approved direction | Site colours/typography replace per-block decorative themes |
| ES-D07 | approved direction | Keep Pinia; single store-backed inserter boolean; no two mirror watchers |
| ES-D08 | **approved by user** | User confirms old custom styling normalizes to presets/site defaults, canonical attrs persisted on next ordinary save; no bulk/history rewrite |
| ES-D09 | proposed implementation baseline | Small/Medium/Full fractions 1/3, 2/3, 1; two-column ratios 1:1, 2:1, 1:2; 3–6 Equal; physical media sides |
| ES-D10 | scope interpretation | Retain Bar/Marks quote styles, dialogue structural layouts/identity colours, functional/content options, general alignment and non-image width presets; no new style catalogue |
| ES-D11 | required invariant | Shared tokens/visible block contract across editor/public; no independent theme-only block overrides |
| ES-D12 | safety boundary | Docs do not authorize implementation/deployment/user-data operations; verification uses owned isolated fixtures |

Update this table when the user resolves ES-D08 or corrects a scope interpretation. Do not turn a proposed baseline into a claimed user decision.

## 4. Assessment evidence

| Finding | Evidence / limitation |
|---|---|
| Large components | Source line counts: BlockEditor 3,049; BlockSettings 2,207; BlockToolbar 1,548. Counts are not a complexity target |
| Image sizing overlap | Schema/settings store duplicate pixel/percentage representations; settings conversion uses intrinsic width, drag conversion uses container width, render uses container percentage. Source only |
| Hidden alternate writers | Column/media split dragging and code node-view zoom write presentation attrs outside sidebar. Source only |
| Inserter duplication | Local boolean + two watchers mirror Pinia; parent close bypasses local target reset. Source only; no runtime test run |
| Variant preservation | Current thumbnail is cover-cropped 360×360; medium/large fit-inside 1024/1600 bounding boxes, actual widths vary; missing variants return 404. Source only |
| Existing parity rules | Component-owned styles/shared tokens; both surfaces update together. Existing docs are requirements, not evidence all current blocks satisfy them |
| Test isolation/tracking | Default Playwright config loads environment/may reuse dev app; many local tests ignored. New relied-on regressions need owned runner and scoped tracking |

## 5. Acceptance tracking

| Group | Status | Evidence / gap |
|---|---|---|
| A1–A3 Inserter | partial | Actual SFC setup + Vue/Pinia regression coverage; browser/mobile/swipe evidence not run |
| B1–B4 Images | partial | Pure source metadata/preservation tests and owned Chromium geometry/fallback; full-app privacy/upload matrix pending |
| C1–C7 Layout/presentation | partial | Shared presets/defaults and actual settings/schema content operations; full-app functional/visual matrix pending |
| D1–D4 Existing-content/round trips | partial | ES-D08 approved; pure normalization/save/diff and Chromium actual image schema/HTML checks pass; complete versions/app flow pending |
| E1–E3 Browser/quality | partial | Lint/style/typecheck and owned component/browser checks pass; bounded units pass; default timing failures/build timeout/full-app gaps below |
| E4 Documentation | passed (docs only) | Local links/tasks/whitespace checked; final implementation reconciliation still required in ES-05 |
| Operator rollout/downgrade | pending | Separate approval/evidence required |

## 6. Session log

### ES-00 — Documentation preparation

- Read established plan/specs/progress/acceptance/operations/handoff formats and the WYSIWYG contract; kept task definitions separate from mutable evidence.
- Rechecked source for image/media sizing, columns/drag, spacing/quote/code/maths/tabs/accordion/dialogue controls, Pinia callers and media variant profiles/serving behaviour.
- Drafted nine-file package with approved direction, bounded defaults, source inventory, retained functionality, legacy appearance confirmation gate, dependency-ordered tasks, acceptance matrix and future delegation.
- No application tests/build/browser/DB/media mutations or configured app execution. No user `.env`, accounts, storage, containers or deployment used; no commit/push.
- Documentation validation: Node-based checker on Node v24.15.0 / Windows, covering nine package files plus three modified predecessors: **12 Markdown files, 105 local links, 22 anchors, six task definitions/ledger rows and 22 unique acceptance rows passed**, with final-newline/trailing-whitespace checks. `git diff --check` passed for tracked edits; the checker also covered new untracked package files. Node 24 was used for docs checks only, not application acceptance.
- ES-00 complete; implementation/visual/round-trip checks remain unrun. ES-D08 is explicitly unresolved. Next action is a separately delegated implementation and focused existing-appearance confirmation; no code/runtime/data operation is implied.

### ES-01/02 — Independent state implementation; ES-D08 pending

- Rechecked HEAD `b42eba92ead19b3528a50c1105b81e1e2862ab97`; pre-existing dirty files were this documentation package and three predecessor/discovery notices. Preserved them. Read all nine package docs, WYSIWYG rules and referenced fixture/harness/verification/handoff safety guidance.
- State inventory: child `+`, exposed open/close/pick, parent inline inserter and mobile/swipe actions all use the same editor store. Nuxt may reuse the post page on parameter change; pending insertion targets must be cleared synchronously before a new post is edited.
- Characterization: new tracked `tests/unit/editor-inserter.test.ts` compiles/executed actual `BlockEditor.vue` setup with real Vue reactivity/Pinia; Tiptap/DOM adapters mocked. After correcting fixture-only import/meta/chain setup, pre-change run reproduced **five target failures / one pass**: initial store-open, immediate store updates, external close/reopen target cleanup, targeted + immediate open and unmount reset. This is component/store evidence, not real browser/Tiptap rendering.
- Code: `storeToRefs(editorStore).inserterOpen` replaces local boolean/both mirrors. One synchronous cleanup watcher clears editor-local targets on any close, including same-tick reopen. Pick snapshots its target before closing; unmount closes/reset targets. Post-page `watch(id)` closes and deselects on reused post navigation. No Pinia removal, schema/media/API/presentation changes.
- Added scoped `.gitignore` exception for the new test. No blanket tracking change. Tests cover targeted/untargeted actions, parent/store closes, pick replacement/position, post change and unmount.
- Runtime: Node **v22.22.0**, Windows; Vue/compiler **3.5.38**, Pinia **3.0.4**, Tiptap Vue **2.27.2**, Nuxt **4.4.8**, Vitest **4.1.6**, TypeScript **5.9.3**.
- Checks: final targeted inserter suite **9/9 passed**. Full `eslint . --quiet`, `node scripts/check-style-drift.mjs`, production `nuxi typecheck --dotenv=false` and `git diff --check` passed. Lint/style-drift/diff reran after the final test additions; typecheck ran after both application edits. No CSS changed, so no CSS lint requirement.
- Default unit suite ran twice: each **117 files passed / 1 failed / 1 skipped; 1115 passed / 1 failed / 8 skipped** (before final two inserter tests were added). Sole failure: existing Japanese Kuromoji annotation test exceeded its 5-second limit. Concurrent focused annotate/inserter attempt also timed out; standalone annotate later **4/4 passed** in 1.21s. Supplementary final `vitest run --maxWorkers=4`: **118 files passed / 1 skipped; 1118 passed / 8 skipped**, 48.29s. No annotation code/tests/limits changed; default-concurrency suite is not declared passed.
- Visual inventory: registry/extension/settings/node-view writers and public renderers remain legacy; image/media creation uses legacy attrs. `MediaRecord` includes actual variant metadata but `mediaRecordToFileItem` drops it; future source selection needs a safe narrow metadata path, not fabricated `srcset` widths. Post hydration/version restore assign raw documents; save/dirty comparison uses `utils/emptyBlocks.ts`, rendered-diff signatures use raw attrs. Shared normalization must reach these boundaries after ES-D08 confirmation to avoid false dirty/autosave/version changes.
- No production build/browser/mobile/swipe or DB test; no claim of final ES-02/visual acceptance. ES-D08 confirmation requested at implementation start: old custom presentation may normalize without bulk rewrite and persist canonical attrs on next ordinary save. Awaiting answer; no silent legacy decision.
- No user `.env`, configured app/DB, storage/accounts/containers or deployment operated on. No commit/push.

### ES-03/04/05 — User-confirmed visual simplification, local verification

- User explicitly confirms ES-D08: old styling normalizes to presets/site defaults, canonical attrs persist on next ordinary save, no bulk post/version rewrite. Kept documentation/pre-existing state changes; no commit/push.
- Added pure `utils/blockPresentation.ts` import mapping: canonical presets win, percent -> nearest size, pixel/natural/unsupported modes -> Full, physical two-column splits -> nearest layout, 3–6 -> Equal, targeted decoration removed. Preserves unknown node data/marks/IDs/media/attribution/children; idempotent/non-mutating. Public per-node normalization avoids repeated whole-subtree traversal; save normalizes within its existing walk.
- Boundaries: initial/editor model hydration, schema HTML parsers, public components, rendered-diff signatures, save/dirty/local-draft comparison and `extractBlocksFromDoc` on actual create/update persistence. `buildDocFromBlocks`/stored version reads remain unchanged; no read-triggered DB write, boot migration or bulk version conversion.
- Images/media-text: only Small/Medium/Full and proportional geometry; all dimension/lock/source/free-resize controls/handlers removed. `imageSources` holds bounded delivery metadata tied to exact source, not author presentation. New JPEG/PNG picks/uploads can use known actual-width medium/large variants; no cropped thumbnail, unknown/animated/vector/rotated-aspect candidates retain original. Legacy images without candidate metadata serve original. Source changes clear stale metadata. Browser error removes `srcset`/`sizes` once to retry original; no server endpoint/storage/privacy change.
- Columns/media-text: Equal/Wider left/Wider right (2:1 etc.); 3–6 Equal. No free split drag. Column card drag reorder remains. Shared column CSS/width mapping and content-preserving count/removal; tab/accordion removal also preserves removed nested content as the original did. Default-open/single-open/collapsed and titles/order/headers remain. Physical layout stays fixed when content reorders.
- Settings rewritten to typed content/functional field definitions plus explicit nested operations; no arbitrary presentation engine. Quotes keep Bar/Marks and attribution with shared quote CSS/site tokens. Code removes authored theme/zoom, observes site light/dark for syntax palette, uses site foreground/surface and shared monospace metrics; reader zoom stays ephemeral. Maths retains KaTeX/default scale/alignment/source tools. Tabs/accordion use one decoration/icon; named separator line styles remain. Dialogue keeps identities/avatars/layouts/authoring, removes margins. Retired schema attrs/helpers/constants/decorative variants removed; remaining code-theme CSS retained for source/highlighting consumers.
- Locales: canonical preset/quote labels added en/zh-CN. Scoped tracking exceptions for new tests and existing previously ignored empty-block/dark-mode specs used by acceptance. Existing empty-quote-save expectation updated to canonical `style: bar`; existing dialogue margin expectation changed to absence. No auth/resource/selection assertion weakened.
- Added `editor-settings.test.ts`: actual SFC setup with ProseMirror schema/state tests count reduction, removal content preservation, reordering, accordion open defaults and locale preset labels. Added normalization/save/diff/unchanged-read and source-candidate/fallback tests.
- Opt-in `PB_EDITOR_BROWSER=1 ... vitest run tests/unit/editor-presentation-browser.test.ts`: actual compiled paired image/media/columns/quote SFCs in owned Chromium, real Tiptap/ProseMirror image JSON/HTML parser/serializer, widths 360/768/1024/1440 and light/dark, image aspect/preset equality, media/grid/quote metrics, viewport overflow and intercepted missing-candidate/original network fallback. Node-view wrappers/content are adapters, not real editor chrome; only these block pairs covered. **Not** a full Nuxt/authenticated app or all-block parity result.
- Final focused command (browser fixture + settings/presentation/image/inserter/dialogue/empty/diff): **8 files / 95 tests passed**. Node **22.22.0**, Windows, Vue/compiler **3.5.38**, Pinia **3.0.4**, Tiptap **2.27.2**, Nuxt **4.4.8**, Nitro **2.13.4**, Vite **7.3.5**, Vitest **4.1.6**, TypeScript **5.9.3**; installed Chromium via Playwright **1.60.0**. Full lint/style-drift, production typecheck without `.env`, targeted stylelint and diff checks pass after application edits.
- Default full units first exposed obsolete canonical-quote expectation plus unrelated media timeout; fixed expectation with no assertion removal. Final default run: **119 files passed / 2 failed / 2 skipped; 1142 passed / 2 failed / 9 skipped**. Failures: existing media abort/deadline timing and existing maintenance preparing crash child exited early under concurrency. Focused pair later **26/26 passed**, files unchanged. Supplementary bounded `vitest run --maxWorkers=4`: **121 files passed / 2 skipped; 1144 passed / 9 skipped**, 38.24s (before final two locale cases; these passed in focused final). Default concurrency is not declared passed.
- Added `scripts/backend-hardening/editor-build.mjs --fixture`: explicit Node 22 opt-in, tracked source + enumerated new code copy, excludes `.env`/storage/outputs, sanitized env/generated session/APP_VERSION, owns process/receipt/cleanup and unlinks dependency junction before removing its temp root. Initial inline attempt failed missing fixture APP_VERSION (no code failure). Corrected runner: client and server compile passed (server ~24s) but **Nitro bundling hit 210-second deadline**, owned child killed and temp removed; no full build/smoke pass. No heap/production-limit increase.
- Final small delivery improvement: lazy editor images use `sizes="auto, ..."` so supported browsers select candidates using actual nested container width, with viewport fallback for older browsers. Rechecked browser/image/settings **3 files / 15 passed**, full lint/typecheck/diff pass after this change; no new attrs or server metadata queries.
- Remaining mandatory local gaps: completed production build/actual server smoke, actual authenticated Nuxt controls/paste/save/reload/version/diff flow, all-block/theme geometry (code/maths/tabs/accordion) and full image-format/private-media/upload matrix. No configured user server/DB/accounts/storage or deployment used. Operator previews/backup/rollout/downgrade remain pending; no release authorization or manufactured evidence.

## 7. Implementation checkpoint template

```text
### YYYY-MM-DD — ES-0x
- Current revision/dirty state and owned fixture identity:
- Requirement/acceptance IDs and decision confirmation:
- Changes and retained content/functional controls:
- Serialized attrs/legacy/public/editor/version/diff behaviour:
- Exact Node/packages/browser/OS and commands/counts/skips:
- Evidence tier, failures/blocked checks and limitations:
- Remaining local work vs separate operator gates:
- Next eligible task; no user-data/deployment operations:
```
