# Editor simplification: full-task LLM delegation

**Implementation delegated; use this for continuation.** ES-D08 is confirmed; state/preset/presentation changes are implemented locally. See progress for exact component/schema/browser evidence and remaining full-app/build acceptance. [Progress](./progress.md) is the resume point, [plan](./plan.md) defines tasks, [specs](./specs/00-architecture.md) define behaviour and [acceptance](./acceptance-test.md) defines evidence.

## Copyable assignment

```text
Implement the approved editor simplification in `docs/editor-simplification/`.

Read completely: progress.md, plan.md, all four specs, acceptance-test.md,
operations.md and this handoff. Follow the WYSIWYG block contract and referenced
fixture/runtime safety rules. Recheck current source/Git state; line numbers
and the documented revision are navigation hints, not fixed patch recipes.

Execute ES-01 through ES-05 in dependency order in one assignment, recording
checkpoints/evidence in progress.md and continuing without task-by-task approval.

Target:
- Small / Medium / Full content-width images; proportional aspect always.
- Automatic source resolution; no author resolution or arbitrary sizing modes.
- Equal / Wider left / Wider right two-column/media layouts; 3–6 Equal only.
- Site-owned spacing and quote typography/colours; retain Bar/Marks styles.
- Site-owned block decoration, keeping code syntax/monospace and KaTeX fonts.
- One store-backed inserter-open ref via storeToRefs; keep Pinia and remove
  both mirroring watchers. Explicitly clear stale targets on external close.

Keep all block types, text/marks/IDs/media/alt/captions/attribution/child
operations and functional settings. Preserve general alignment, existing
non-image width presets, inline formatting/custom HTML and dialogue structural
layouts/character identity. Delete targeted controls AND their state/resize/
rendering branches; don't move them into Advanced or add a generic page builder.

ES-D08 (existing saved custom appearance) is confirmed in the progress ledger.
Continue the documented mapping across editor/public/HTML/JSON/version/diff
boundaries with no bulk database/history rewrite. Do not invent legacy-renderer
retention or alter the approved mapping. Recheck pending evidence, not old
proposal gates, before continuing implementation.

Automatic sources must not use the square cover-cropped thumbnail, invent
variant width descriptors, flatten animation, rasterize SVG or bypass media
privacy. Missing/unknown metadata/candidates must safely fall back to original.
Shared tokens/helpers/styles must preserve editor/public responsive parity;
no theme-only public block overrides or per-post computed presentation values.

Run targeted regressions, lint/style-drift, production typecheck without real
.env, units, targeted stylelint and owned production/browser checks. Verify
360/768/1024/1440, light/dark, en/zh-CN, new presets AND normalized old fixtures,
content/undo/versions/diffs, source fallback and inserter close/reopen.
Track new test/helper files with scoped .gitignore exceptions if needed.

Never use my .env, configured app/DB/storage/accounts/containers. Use generated
owned fixtures, sanitized environments and owned source copies. The default
Playwright config loads environment and may reuse a server: do not treat it
as isolation. Do not deploy, bulk-migrate, run real-data restores, commit/push
or remove shared dependencies merely because one component no longer uses them.
Preserve unrelated dirty changes and existing auth/privacy/resource limits.

Pause only for ES-D08, genuine new scope/data/security decisions or mandatory
verification unavailable after eligible work is exhausted. Ordinary helper
names/translations/refactors within scope do not need approval. Record missing
checks as blocked, never passed; don't copy historical evidence as a new pass.

Final handoff: changed behaviour/files, confirmed compatibility policy,
exact test/environment results, remaining local blockers/operator gates,
next action and explicit statement that no user data/deployment was operated on.
```

## Resume practice

1. Read progress first and inspect current dirty state; ES-00 documentation is not a code pass.
2. Inventory writers/readers and characterization tests; resolve only the concrete unresolved legacy policy, not routine task boundaries.
3. Refactor coherently: Pinia state; image/schema/source rules; layouts/spacing/decoration; persistence/rendering integration. No half-migrated release.
4. Test real schemas and browser geometry/network behaviour, not just option labels or source greps. Retain unrelated content/privacy/selection regressions.
5. Append sanitized evidence/decisions at each durable checkpoint. Plans/specs change only for explicit contract corrections; progress is the status ledger.
6. Finish with combined local checks and truthful compatibility/operations notes. Release remains separately authorized.
