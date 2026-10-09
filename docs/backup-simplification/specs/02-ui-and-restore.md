# Spec 02: Full-only UI, restore and transition

**Proposed target.** Tasks BK-03, BK-05–07. Read [architecture](./00-architecture.md), [bundle/API](./01-bundle-and-api.md) and [acceptance](../acceptance-test.md). This spec does not authorize live restore or deletion.

## 1. Admin experience

### Backups page

- One primary **Create backup** action; remove Create incremental and the type selector. Explain once that each backup includes the full DB and all media originals.
- One **Download backup** action for a ready supported full snapshot, using `/api/admin/backups/:id/download`. Remove separate DB/media and consolidated-chain actions from the UI.
- Keep list, note, timestamps, progress, manual delete, import, restore and retention settings. Show the completed bundle size as download size; component sizes can be secondary details. Do not present the sum of component sizes as the exact HTTP download size.
- Remove parent/chain columns and type badges for normal full rows. Preserved legacy rows may show an **Unsupported legacy backup** badge and original type/reason, with download/restore disabled.
- A legacy full row without a bundle says packaging is needed rather than failed/incomplete. First download performs bounded packaging; busy/headroom/deadline errors have actionable retry guidance. A 409 response must not look like a successfully downloaded archive.
- Show a retention-hold warning when legacy non-full/unknown records suspend pruning. Explain that files are preserved and disk usage can grow; do not add a one-click destructive “fix.”
- Preserve client-only status polling and dispose timers on unmount. Use request-aware auth forwarding for SSR list/detail fetches; existing maintenance progress notes an unresolved SSR list-fetch concern, which must be reproduced on an owned fixture, not assumed fixed by this feature.
- Status stays truthful: exporting DB, collecting media, packing media, **packaging download**, finalizing, completed/failed. Add the packaging phase without removing legacy phase parsing needed by recovery/status readers.

### Create dialog

One optional note field and a concise description. No radio buttons, parent/base picker, table fetch/multiselect, parent defaults or partial validation. Submit note only (the API may accept literal full from old clients). Preserve 202/status polling, disable duplicate submissions, and expose actual job errors. A note is not a path or filename.

### Import dialog

One file input labeled **Backup file (.tar.gz)**. Explain that it must be a trusted PandaBlog full backup and contains DB/media/manifest. No separate manifest upload and no legacy-format UI toggle. File extension is only a selection hint; server validates bytes and layout.

Preserve import versus restore separation: successful import adds a snapshot to the list, never replaces live data. Show bounded-size/deadline/unknown-version/corruption/legacy-unsupported errors clearly; do not report completion when the server only received the upload. Clear input/errors safely between openings and prevent duplicate submits.

### Restore/delete dialogs

Keep explicit replacement warning and existing `RESTORE_<id>` confirmation. Tell users that DB/media are replaced, a verified safety snapshot is mandatory, and previous sessions/devices will be invalidated. Do not promise an atomic DB+filesystem transaction or background variant completion if service stays fenced until rebuilding finishes.

Remove dependent-incremental counts/warnings for eligible full-only history. With preserved unsupported records, prevent deletion of possible full bases and explain the legacy hold. Unsupported rows remain visible; their retirement/archival requires a reviewed offline process, not a new destructive UI flow.

### Locales, access and style

Update both `i18n/locales/en.json` and `zh-CN.json` in the same task. Remove only obsolete backup keys; unrelated analytics/media bulk “partial” text stays. Use existing style tokens/components, keyboard focus, accessible labels and responsive layout. Test en/zh-CN in production-built browser fixtures, with superadmin and unauthorized actors.

## 2. Settings

`default_excluded_tables` exists for partial-table defaults, not actual full-backup exclusions. Remove it from the active interface, return shape, UI form and new settings PUT. Ignore existing saved values without startup deletion or whole-row reset. A new strict PUT rejects the retired key rather than silently implying it changes the full export. Document this narrow old-settings-client incompatibility.

Keep `max_backups` semantics/defaults for eligible full snapshots: current default 10, zero means no automatic count pruning; no retention duration change. Keep the existing numeric range unless a separate decision resolves its mismatch with the 128-record history cap. A UI maximum of 1000 does not authorize silently lifting the history/resource budget; document the operational ceiling and record the mismatch as an existing constraint.

Validation and a verified safety snapshot are mandatory for automatic restore. Remove misleading editable “skip protection” switches from the normal settings dialog and show protection text. Retain current saved/backend semantics during this task:

- `validate_before_restore=false` must **not** skip staging verification, as current restore already requires it.
- `auto_safety_snapshot=false` must continue to refuse automatic restore before destructive intent. Warn that the existing setting blocks restore; an administrator can explicitly enable safety using the existing supported settings API. If the UI offers enabling, it must be an explicit action, not a silent value change on an unrelated retention save.
- Do not remove the safety=false refusal or silently coerce saved false to true. Completely retiring these stored fields/API options would be a separate coordinated decision.

New full backup export preserves all current DB tables. Access files remain separate; do not revive `include_access_logs`, silently filter arbitrary tables or reinterpret partial defaults as full exclusions. Existing historical access-table migration gates remain unchanged.

## 3. One-source full restore

Validate a supported full record before starting restore ownership/journal/fence. Reject incremental, partial, unknown, contradictory selection/ancestry and unsupported manifest versions with a clear reason. No fallback to “latest full” or live media. A new full manifest declares null ancestry/selection; legacy full records may have absent fields only under the explicitly validated compatibility adapter.

Replace `resolveBackupChain` and partial merging with staging exactly one snapshot's DB/media. The existing components remain restore sources; no redundant unpack of the portable bundle is needed for a locally registered full snapshot. If components/bundle metadata disagree, refuse and preserve evidence rather than automatically trusting whichever file is convenient. Legacy full snapshots without bundles still restore through validated components.

Preserve the complete order:

1. Authenticate current superadmin; validate request/snapshot; acquire serialized restore owner and narrow status capability.
2. Close ordinary admission synchronously; drain actual foreground/background/DB/native/FS settlement under current bounds. Recent uncertain writes/new-process holds may block the job without becoming an ordinary startup fence.
3. Prepare owned staging, verify regular files/checksums/capped SQL and media, validate executable SQL in a disposable DB and verify media catalog and representative state. Reject unsupported legacy layout/access-table data before destructive work.
4. Save pre-wipe backup history. Create and verify paired current SQL plus the media/variant rename plan, with adequate disk and same-filesystem rename support.
5. Publish and sync destructive intent **before** wipe/import/live media replacement.
6. Wipe/import; independently verify expected state; apply current safe schema, reprovision configured runtime credentials, rotate auth epochs, remove trusted devices and recycle runtime connection.
7. Reconcile saved current history, swap staged originals, rebuild historical-month variants within restore ownership, refresh settings/security/log/analytics/cache state and verify DB/media consistency.
8. Durably commit, then reopen ordinary service, release ownership and clean only proven owned terminal artifacts.
9. On safe unambiguous failure after destructive intent, restore and verify **both** DB and matching originals/variants, then durably mark rollback before reopening. Ambiguous execution/failed rollback keeps the fence and paired evidence.

Do not weaken these steps because a full-only snapshot has no chain. Keep `validateDumpByStaging`, `verifySnapshot`, `verifyBackupMediaCatalog`, auth/cache refresh and restore generation guards. Remove `consolidateDumps`/chain-only helpers only after all consumers are inventoried; `listDatabaseTables` may serve other schema/admin tasks and must not be deleted solely by its name.

Existing snapshots can include snapshot-era backup registry rows but not their archive directories. Preserve the current pre-wipe history reconciliation so source-instance rows cannot become false ready snapshots on import/restore. Verify newly added bundle metadata survives reconciliation and rollback.

## 4. Restart and old recovery evidence

Retired producers do not retire their evidence. Existing job/journal classifiers must still recognize old create/import/consolidate/restore phases and artifact formats under bounded schemas. Do not rename on-disk recovery files or invalidate status tokens as a side effect of adding `package`/bundle phases.

- Normal failed/interrupted create/import/package: no ordinary-site startup fence; preserve unknown evidence, settle/reclaim jobs under existing token/hold rules, never publish a partial bundle ready.
- Proven pre-destructive interrupted restore: existing bounded safe abort/cleanup behavior.
- Destructive/ambiguous old or new restore: preserve paired safety/journal/media; ordinary boot and traffic remain fenced until supported operator recovery.
- Verified terminal journal: no new fence merely because the file or an obsolete phase name exists.

No automatic SQL rollback at startup, blanket storage cleanup, resetting setup authority or public force-unfence endpoint. Backups-disabled builds still load minimal interrupted-restore safety classification under the maintenance contract.

## 5. Retention, deletion and migration

For full-only eligible history, prune the oldest ready snapshots beyond the existing configured count. No ancestor traversal. Exclude active create/restore/package, leased downloads and unknown/published-ambiguous artifacts. If skipping leased snapshots leaves the count temporarily over target, report/retain them rather than force deletion; retry on a later eligible prune. Deletion must report filesystem/DB failure honestly, not return success after swallowing file removal errors.

If any preserved non-full/unknown/contradictory history exists, suspend automatic pruning and block normal deletion of potential full bases. Do not follow parent chains just to calculate this hold. This changes retention eligibility, not its count/default policy, and must be approved with the compatibility recommendation.

Migration is additive/lazy:

- New creations/imports write versioned full bundles and additive record metadata.
- Existing full snapshots stay byte-for-byte intact; package from original files once as needed.
- Existing non-full/unknown rows and files remain untouched and visible. No startup mass conversion or cleanup.
- Legacy partial default settings are ignored; a normal explicit settings save writes only supported fields, without resetting unrelated settings/security receipts.
- A compatible old release on an approved isolated copy can recover old non-full history before making a fresh full snapshot. Never operate that old release against the current configured database/storage or claim its split downloads are consolidated.

Upgrade/downgrade must preserve DB/media/config/keys/receipts and backup directories. Old releases may not understand bundles/additive metadata or new job phases; image-only rollback is not guaranteed. Test compatibility on a disposable or explicitly approved isolated copy. This task does not authorize downgrade, deployment or retirement of old backup data.
