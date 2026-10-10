# Full-only backups: target operations

**Working-tree implementation; not deployment-approved.** Read [progress](./progress.md) for exact verification and outstanding [plan](./plan.md) acceptance gates. No operation against configured user data is authorized by this document.

## 1. Normal workflow after implementation

1. Sign in as current superadmin and open **Admin → Tools → Backups**.
2. Choose **Create backup**, optionally add a note, and wait for ready. The job captures the full DB and all current media originals, then packages one download. Busy/quiescence windows expire automatically as documented by the maintenance runbook; do not delete locks to bypass them.
3. Choose **Download backup**. Save the single `pandablog-<id>.tar.gz` securely off the server and verify the transfer completes. SHA-256 provides integrity, not proof of provenance.
4. On a compatible instance, **Import backup** accepts that same single file. Successful import only registers a snapshot.
5. Restore requires a separate explicit confirmation and verified safety snapshot; service is unavailable during actual restore and previous sessions/devices will invalidate. Sign in again with restored account/MFA credentials after completion.

A bundle contains exactly `db.surql.gz`, `media.tar.gz` and `manifest.json`. Empty media still has a valid empty archive. Do not unpack/repack/edit the manifest to make unsupported/corrupt data appear valid.

## 2. Included and excluded data

Included: full current DB tables (including settings/accounts/activity/error/groups and any surviving inert `access_logs` history) and all media originals. Derived image variants are rebuilt during restore under its ownership; they are not bundled.

Not included: `.env`, deployment/runtime configuration and encryption keys, access day files/migration receipts, Docker logs, setup authority, restore journals/safety directories, other backups or temporary stages. Preserve session/MFA encryption keys separately and securely; changing them can make restored encrypted data unusable. See [environment/identity operations](../runtime-startup-config/operations.md) and [logging backup policy](../logging/operations.md).

DB backup SQL is executable administrator-trusted data and may contain sensitive account/credential artifacts. Only import archives from sources you trust. Staging against a privileged DB process is **not a hostile-SQL sandbox**. Store backups with restrictive permissions and protect off-site copies appropriately; archive encryption is not added by this feature.

## 3. Storage, retention and transfer limits

Internal snapshot components remain under `storage/backups/<id>/`; a completed `backup.tar.gz` is stored alongside them. This makes downloads simple and avoids repeated assembly but approximately doubles compressed snapshot disk use. Actual total/peak disk and packaging time must be measured during implementation and deployment rehearsal.

Existing retention count/defaults remain: 10 ready eligible full snapshots by default, zero disables automatic count pruning. Active jobs/downloads and publication-ambiguous snapshots are protected. The bounded 128-record history limit remains independently applicable even if a stored count setting is larger.

If preserved legacy non-full/unknown records exist, automatic pruning is held and potential full-base deletion is blocked. A warning explains the reason. No automatic cleanup/conversion is performed; disk growth requires operator planning, not a larger count setting or deleting evidence.

Component budgets remain finite (128-MiB expanded SQL, 256-MiB compressed DB, 2-GiB media, bounded entries/manifest). The outer envelope permits at most 2,428,567,552 encoded bytes and 2,420,178,944 expanded bytes (component ceilings plus 64-KiB framing, and an additional 8-MiB encoded gzip allowance); it does not raise SQL/media limits. Actual upload bytes/expansion are checked independent of Content-Length. Proxy size/time limits may reject smaller uploads first; rehearse a narrowly scoped backup import configuration, never remove all app limits.

Keep space for existing components + bundle + import staging/validation, and for restore SQL/safety/old-new originals/variants plus the free-space reserve. A source below the upload cap can still exceed expanded SQL limits or available staging headroom. Treat refusal as protection, not a reason to disable validation.

## 4. Existing backups and clients

- A surviving legacy `access_logs` table is preserved/restored as inert full-snapshot data. Access migration/table removal no longer runs on boot or restore. Existing snapshot validation, paired safety/rollback and format refusals remain; access files/buffers/proxy history need separate archives. See [logging operations](../logging/operations.md).
- Existing ready **full** snapshots remain restorable. First bundle download packages their original files once without reading current live data or changing original components/manifest. A busy/headroom error can require a later retry.
- Existing split full DB/media imports and raw full download endpoints remain backend compatibility adapters; the new UI uses one bundle input/action. Consolidation parameters are no longer accepted. A legacy pair without a manifest remains an explicit administrator assertion of full coverage: validation cannot prove omitted tables were not intended. Any supplied manifest must explicitly assert full; unknown/non-full/contradictory metadata rejects.
- Existing **incremental/partial/unknown** snapshots are preserved and displayed as unsupported for automatic restore/download. The implementation request approved this preservation/compatibility policy; retirement of the preserved data still requires separate operator authorization.
- To recover a legacy non-full snapshot, preserve every required ancestor and use a compatible old release on an **explicitly approved isolated copy**, verify the recovered DB/media, then create a new full snapshot. Do not assume old media-download links consolidate a chain.
- Retiring old records/artifacts requires operator review and separate authorization. There is no automatic offline converter, one-click destructive retirement or permission to delete full bases.
- Partial-table default settings become ignored; new settings PUTs reject the retired key. Current validation/safety fields retain their runtime semantics; saved safety=false still blocks automatic restore until explicitly enabled.

## 5. Restore and interrupted-job handling

Full-only changes source selection, not safety. The [maintenance runbook](../maintenance-simplification/operations.md) and [backend offline recovery](../backend-hardening/operations.md#offline-recovery-no-public-unfence-endpoint) remain authoritative.

| Situation | Expected target behavior |
|---|---|
| Create/import/package fails or process dies before ready | No ordinary-site startup fence; partial bundle is not downloadable; preserve unknown artifacts and use bounded job recovery |
| Legacy packaging fails | Original full snapshot remains unchanged; retry after correcting the error |
| Download aborts/deadline | Close stream/lease; leave completed snapshot intact |
| Restore preparation/drain/validation fails before intent | Abort safely; live data unchanged; ordinary service can reopen after verified abort |
| Restore commits or paired rollback is verified | Durable terminal state before reopening; previous cookies/devices invalidate |
| Destructive restore/rollback interrupted or execution ambiguous | Preserve journal, paired SQL/media/variants safety and swap evidence; ordinary initialization/traffic remains fenced |

Do not delete `.job.lock`, `.restore-journal.json`, `.restore-*`, setup authority, access migration receipts or media witnesses to make a restore/startup succeed. Old restore phases remain recognized even after their mode producers are removed. `panda recover` remains read-only restore inspection, not an automatic resume/rollback/cleanup command.

Validation is mandatory even if a legacy setting says false. Safety=false refuses automatic restore before destructive intent. Current backup maintenance requires explicit privileged authority; it never falls back from invalid scoped runtime credentials to ROOT.

## 6. Upgrade and downgrade checklist

Before authorized upgrade:

1. Record image/revision, DB version, schema/layout/credential compatibility and current readiness/restore evidence.
2. Preserve independently verified DB/media/config/keys/access policy and all relevant receipts; inspect outstanding destructive restore state.
3. Inventory backup types on an approved copy. Accept legacy compatibility and retention hold before replacing the image; recover needed non-full history on that copy if required.
4. Verify added bundle disk headroom, mounts/permissions, proxy transfer limits and supported DB execution timeouts below maintenance holds.
5. Rehearse create/download/single-file import/restore, empty media, legacy full, paired rollback and interrupted restore on the approved isolated copy.
6. Stop/remove the old app before starting one new instance. Check readiness (not liveness alone), owner login, private data/media and backup status.

No deployment is authorized by documentation/code completion. Old releases may not understand new bundle metadata/job phases; new bundles alone may not be importable by them. Keep a compatible image/data/config pair and original components. Test downgrade on an approved isolated copy; do not modify manifests/journals/receipts to force an old image to start.

## 7. API and publication details

- Create accepts only `{note?: string|null, type?: 'full'}`; parent/table/non-full/unknown keys reject before job admission. New create/versioned notes cap at 500 characters. Bounded `source_id` and `source_note` provenance preserve imported identity and historical split-import notes (up to their old 2000-character limit) without using them as paths or loosening the new note limit.
- Bundle GET (and HEAD admission check): `/api/admin/backups/:id/download`, private/no-store gzip attachment with actual encoded length. Browser downloads stream natively, not through a multi-GiB Blob. Eight readers maximum, no queued readers, five-minute stream deadline. Delete/prune refuses/skips active readers through actual stream closure.
- Import multipart: one `backup` file **or** legacy `db` + `media` + optional `manifest`; duplicate, mixed, unknown parts and fields reject. File MIME/name does not establish validity. New bundles require strict `pandablog-backup` version 1/full metadata and exact three regular root members.
- Unsupported/nonready snapshots return 409; invalid structure/manifest/version 400, upload/member caps 413, ingestion deadline 408, storage/authority/validation errors sanitized 5xx. Unknown format has reason `unsupported-version`.
- Retired `default_excluded_tables` and unknown settings PUT keys reject; saved keys are ignored. Retention-only saves do not change safety=false; the UI offers an explicit enable-safety action.
- Files request 0600 and stages 0700. Completed bundle publication uses a synced exclusive `.part` file and atomic **hard-link** publication, not overwrite-capable rename; directory sync follows, then the owned part is removed. Verify hard-link/mount support. A publication-ambiguous target or ready row is preserved, never removed/relabelled failed by a lost reply.
- New create/import workers confirm an exact ready generation after a lost metadata reply without overwriting it; failed confirmation preserves the row/components/bundle. Legacy first-package retries can reconcile an exact validated completed target after lost metadata publication. Unrecognized targets are preserved and refused. Ordinary create/import interrupted before ready is not automatically made ready just from file existence; preserve it and inspect exact job/row/artifact state.

## 8. Final operational evidence to fill

Record exact format/API errors and versions, completion/transfer time, actual bundle/component bytes and disk peaks, application/DB memory separately, proxy/mount behavior, legacy decision, rollback compatibility and all remaining operator gates in [progress](./progress.md). Until that evidence exists, this document remains a draft target, not a proven production procedure.
