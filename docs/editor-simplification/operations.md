# Editor simplification: author and upgrade runbook

**Implemented locally; not rollout-approved.** Preset controls, normalization and Pinia cleanup are in the working tree. Isolated component/schema/browser evidence exists; full-app/production acceptance remains incomplete. Read [progress](./progress.md) for actual implementation/evidence and [plan](./plan.md) for scope. Existing custom appearance policy ES-D08 is confirmed by the user.

## 1. Author-facing changes after implementation

- Images: choose Small, Medium or Full content width. Aspect ratio is always preserved; no pixel/percent dimensions, distortion checkbox or free resizing. Resolution is selected automatically; original source remains safe fallback.
- Columns/media-text: choose Equal, Wider left or Wider right for two sides. Three through six columns use Equal. Content count/order/header controls remain.
- Spacing: site defaults replace per-block margins, padding and gaps.
- Quotes: Bar or Quotation marks; fonts and colours follow the site. Quote text and attribution remain.
- Code, maths, tabs, accordion and separator decoration follows site tokens/defaults. Code syntax highlighting/monospace and valid formula fonts remain; content and functional controls remain.
- Dialogue keeps structural layouts and speaker identity colours/avatars, but not arbitrary outer margins.
- Inserter looks/works the same by intent. Its open state has one Pinia source; external close/reopen cannot retain an old insertion target.

Full content width is the containing column, not the viewport. General alignment, non-image block-width presets, inline formatting and custom HTML are not retired by this plan. Theme settings remain site-level token choices, not an independent public block-styling engine.

## 2. Existing posts and versions: confirmed policy

The user approved ES-D08 normalization to the new presets/site defaults without bulk rewrites; see [spec 03](./specs/03-state-and-existing-content.md). Behaviour:

- Old custom styling can look different immediately when rendered under the new rules.
- Original text/media/marks/IDs/captions/attribution/children are preserved.
- Reads and theme switches do not save content or create versions. An ordinary explicit edit/save persists canonical attrs.
- Stored old versions remain unchanged, but rendered versions/diffs use the new presentation rules.
- No boot migration, database scan, automatic version rewrite or variant regeneration is added.

If preserving exact old visual layouts is necessary, decide that before visual implementation. It requires a separately scoped legacy strategy, not silently retaining all old controls/renderers.

## 3. Separately approved rollout checklist

Documentation or local implementation does not authorize operating on real posts, backups or deployment.

1. Resolve ES-D08 and confirm implementation/local acceptance in progress. Do not deploy partially updated editor/public renderers or an unverified import schema.
2. Using existing approved backup procedures, obtain and independently verify a backup. Do not create a new editor-specific backup format.
3. On a separately approved isolated copy, preview representative custom images, splits, quotes, code/formula blocks and nested content in both editor/public views; inspect versions/diffs and en/zh-CN light/dark behaviour.
4. Confirm expected visual changes and source/variant fallback with the operator; validate at 360/768/1024/1440 pixels and ensure no page overflow.
5. Deploy only after separate authorization and applicable existing release gates. No SQL/bulk post migration is prescribed by this package.
6. Verify create/edit/save/reload and close/reopen insertion targets. Retain backup and prior compatible source according to existing policies.

## 4. Downgrade limitation

A code rollback cannot reconstruct removed visual attrs once a post is saved canonically. Untouched historical versions/backups may contain them, but restoring real data requires its own authorization and compatible-release rehearsal. Do not promise exact visual rollback or introduce an automatic converter.

## 5. Diagnostics

| Symptom | Check |
|---|---|
| Editor/public size or spacing differs | Shared preset/token mapping and visible markup; no theme-only block overrides |
| Small image is cropped/square | Do not choose the current cover-cropped thumbnail for content images |
| Image lost animation/vector behaviour | Automatic source policy must preserve original for animated/vector formats |
| Image missing when a variant is absent | Known-candidate metadata and tested bounded original fallback; do not bypass media auth |
| Reopened inserter inserts at old block | Store-close cleanup, including same-tick reopen and post navigation |
| Old saved layout changes unexpectedly | Check confirmed ES-D08 mapping; no ad hoc legacy sizing branch |
| Theme change creates a post version | Rendering tokens must not be persisted as post content |

Report reproduction fixture, affected surface/preset/theme/viewport and actual evidence. Do not debug by accessing the user's private media/DB or disabling authorization.
