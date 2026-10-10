# Editor simplification: acceptance matrix

**Status: required target checks, not implementation passes.** Results belong in [progress.md](./progress.md). Tasks: [plan.md](./plan.md). Legacy visual semantics are gated by ES-D08 in [spec 03](./specs/03-state-and-existing-content.md).

## 1. Required evidence

| ID | Assertion | Evidence / task |
|---|---|---|
| A1 | Inserter uses one store-backed boolean, no mirror watchers; initial already-open store is reflected immediately | Source + component/store integration; ES-02 |
| A2 | Child +, exposed untargeted open, parent/mobile/swipe, close/cancel and pick agree immediately with parent layout | Real component + browser; ES-02 |
| A3 | External close/reopen (including same tick) and post navigation discard stale targets; intended + replacement/position insertion still works | Integration + browser regression; ES-02 |
| B1 | Only Small/Medium/Full content width are offered; no pixel/percent/mode/lock/source selectors or free-resize image path remains | Source + browser, standalone/nested/media-text; ES-03 |
| B2 | Presets preserve intrinsic aspect at all viewports, never exceed container; source change clears stale metadata without changing preset/content | Helper/component + browser geometry; ES-03 |
| B3 | Automatic sources use actual non-cropped variant dimensions; no square thumbnail crop; unknown/external/SVG/animated sources preserve original | Unit + real image/browser fixture; ES-03 |
| B4 | Missing/stale variants safely fall back without loops; private originals/variants stay inaccessible to unauthorized readers | Browser/network + existing media privacy tests; ES-03 |
| C1 | Two columns and media/text expose only three layouts; 3–6 columns Equal only; no custom ratio/percentage resize writer remains | Source + helper/browser; ES-04 |
| C2 | Physical wider-left/right remains correct after media position changes; add/remove/count/order/header/nested content and undo retain content | Unit + editor/browser; ES-04 |
| C3 | Columns, accordion, dialogue, maths and separators use site spacing, with no arbitrary margin/padding/gap writer | Source + theme/browser geometry; ES-04 |
| C4 | Quotes retain Bar/Marks and attribution; no font/size/foreground/background/theme-colour controls; site tokens drive light/dark | Source + browser; ES-04 |
| C5 | Code has automatic site-mode styling and shared font/gutter metrics; no authored theme/zoom; language, highlights, wrapping, line numbers and reader actions remain | Unit + browser visual/functional; ES-04 |
| C6 | Maths retains source/KaTeX rendering/alignment; tabs/accordion functional options work with one decoration; separator named line styles still work | Unit + browser; ES-04 |
| C7 | Dialogue structural styles/character colours/avatars/authoring remain; only arbitrary spacing is retired; inline marks/custom HTML unaffected | Existing/new dialogue and parity checks; ES-04 |
| D1 | Confirmed legacy mapping is deterministic, idempotent, non-mutating, nested-safe; malformed/nonfinite attrs default safely and canonical presets win | Pure unit matrix; ES-01/03/04 |
| D2 | Create/pick/upload/paste/HTML/JSON/load/export/save/reload emit/read canonical attrs; text/marks/IDs/media/captions/attribution/children survive | Actual schema + owned app round trips; ES-03/04/05 |
| D3 | Versions/restore/preview/public/diff apply identical effective mapping; reads/theme changes cause no autosave/version/bulk write | Integration + owned app/DB/browser; ES-05 |
| D4 | Unknown content isn't silently lost; prior inputs remain unchanged; rollout/downgrade limits and canonical serialized contract documented | Unit/integration + docs review; ES-05 |
| E1 | Editor/public visible geometry and styles match for new presets and normalized legacy fixtures at 360/768/1024/1440; no overflow; stacks at/below 48rem | Real browser parity/screenshots; ES-05 |
| E2 | Built-in themes, light/dark and en/zh-CN render readable content; preset selection is clear and keyboard-accessible; controls translated together | Browser + locale/source checks; ES-05 |
| E3 | Lint/style-drift, production typecheck, targeted CSS lint, default units, production build and diff checks pass; no dead writers/imports remain | Supported runtime + source review; ES-05 |
| E4 | Implementation/compatibility/evidence docs agree; unrun tests and operator gates are not declared passed | Docs/link review; ES-00/05 |

ES-D08 is confirmed. D1–D4 still require the specified evidence; confirmation alone is not an acceptance pass. A source grep alone is not evidence of runtime geometry, fallback or round-trip correctness.

## 2. Fixtures and matrix coverage

- Use the pinned supported Node version (currently `.node-version`: 22.22.0; recheck), installed package versions and explicitly owned generated fixtures. Record OS/runtime/framework/browser versions and exact commands/counts/skips.
- Never load the user's `.env`, reuse configured app/DB/storage/accounts or kill another session's server. Read [fixture safety](../backend-hardening/harness.md), [verification rules](../backend-hardening/specs/09-verification.md) and [owned runtime/browser protocol](../backend-hardening/release-handoff.md) before execution.
- `playwright.config.ts` loads environment via `loadPlaywrightEnvironment` and may start/reuse a dev server. A default e2e invocation in this checkout is **not** isolated. Use an owned source/app/config with generated credentials and an explicit owned base URL; sanitize inherited secrets. Existing authenticated specs may skip without credentials; a skip is not a pass.
- Build fixtures exclude real `.env`, storage and generated outputs. Test scripts must enforce owned cleanup and track new helpers/tests with scoped `.gitignore` exceptions; do not broaden all ignores.
- Image fixtures: landscape/portrait/square/small raster, EXIF-oriented raster, animated image, SVG, external URL, missing variant/metadata and unauthorized private media; standalone and nested inside columns/tabs/accordion/media-text. Use actual variant dimensions, not assumed labels.
- Layout fixtures: all 2-column presets, 3/4/5/6 Equal, media on each side, nested blocks, count reduction/reorder, no-content-loss undo. Include tablet breakpoint boundary and full-bleed **non-image** parents.
- Presentation fixtures: both quote styles/attribution, syntax/highlight lines/wrapped code/line gutters, formula/error state, tabs, all accordion open behaviours, separator named styles, dialogue layouts/identities.
- Legacy fixtures cover every removed attr family, mismatched overlapping modes, canonical+stale attrs, missing/invalid values, post versions and diffs. Do not mutate or rewrite historical source fixtures to make normalization pass.

## 3. Commands and starting points

Run in the isolated environment using the supported Node for children as well:

```sh
npm run lint
NODE_ENV=production node node_modules/@nuxt/cli/bin/nuxi.mjs typecheck --dotenv=false
npm run test:unit
# Targeted stylelint for changed .vue/.css files, then owned production build/browser runner.
git diff --check
```

Target existing `all-blocks-parity.spec.ts`, `editor-public-visual-parity.spec.ts`, dialogue controls/block specs, and new tracked inserter/preset/schema/source helpers. Some local inserter/editor/code-settings specs are ignored today; make any relied-on regression tracked. Replace assertions of retired options with target assertions while preserving auth/privacy/content/selection tests.

If server query/media projection semantics change, add actual guarded DB/H3 coverage; mocks alone cannot prove privacy/metadata delivery. A DB/schema change is not required merely to define presets and is outside scope unless justified.

## 4. Reporting and done

For each acceptance ID record exact test name, command, environment, result, screenshots/network/geometry where relevant, and limitations. Track `pending`/`blocked` separately from `passed`. Default unit execution and supplementary bounded-worker runs are separate evidence. Reproduce unrelated failures safely and record them; do not weaken tests, blindly enlarge limits or claim prior totals as current evidence.

ES-00 needs documentation checks only. Code completion requires available mandatory local acceptance; rollout/representative real-data previews/backups/downgrade remain separately authorized operator gates. No performance claim without measurement.
