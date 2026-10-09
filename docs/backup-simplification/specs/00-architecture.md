# Spec 00: Full-only architecture and preservation

**Proposed target, not current behavior.** Applies to BK-01–07 in [plan](../plan.md). [Progress](../progress.md) is the evidence source. Read [bundle/API](./01-bundle-and-api.md) and [UI/restore](./02-ui-and-restore.md) together.

## 1. Keep the safety system, remove the mode system

The simplification removes choices and branches, not independent protections:

| Remove from active backup execution | Preserve |
|---|---|
| Incremental media diff and ancestor hash union | Full DB export and all original media under existing publication admission |
| Partial table selection and consolidation | Staging import, schema/content/media verification |
| Parent/base/chain-root selection and chain extraction | Explicit replace restore, paired SQL/media safety generation |
| Dependent-chain UI and normal ancestor-aware pruning | Token-safe job ownership, bounded history, approved legacy preservation |
| Separate UI DB/media downloads and multiple import inputs | Streamed file transfers, one portable artifact, full-only compatibility adapters |
| Table-default settings and obsolete options/text | Mandatory restore safety, current auth/CSRF/private response policy |

No permanent application writer receipt, distributed mutex, startup latch, new public recovery API or separate bundle service. Ordinary job interruption still affects jobs only; destructive/ambiguous restore still fences boot/traffic under the [maintenance contract](../../maintenance-simplification/specs/02-jobs-and-restore.md).

## 2. Data flow

```text
create -> current superadmin + request validation -> serialized create owner
       -> media publication lease + no pending claims
       -> stream full DB -> gzip/file sync
       -> bounded original inventory -> media tar/gzip/file sync
       -> manifest -> portable bundle.part -> sync/rename -> ready metadata
       -> eligible retention -> release actual work/owner

download -> current superadmin -> ready full snapshot + immutable bundle
         -> bounded read lease -> file stream -> settle/close -> release
legacy full without bundle -> serialized package owner -> existing files only
                          -> validate/hash -> durable bundle -> ordinary download

import -> current superadmin + CSRF -> serialized import owner
       -> owned upload stage -> bounded bundle unpack -> existing full validator
       -> immutable internal files + normalized manifest + completed bundle
       -> ready registration (new local id; source id is provenance only)

restore -> current superadmin + explicit confirmation -> full record check
        -> serialized restore owner -> close/drain -> stage one snapshot
        -> validate + paired safety -> durable destructive intent
        -> replace DB/media + schema/credentials/epochs/variants/cache/history
        -> verified durable commit or paired rollback -> reopen/release/cleanup
```

Do not export live data during download. A bundle packages one existing snapshot, never DB from one generation plus media from another.

## 3. Storage and metadata

Recommended new snapshot directory:

```text
storage/backups/<local-id>/
  db.surql.gz
  media.tar.gz
  manifest.json
  backup.tar.gz       # portable, completed immutable artifact
```

`backup.tar.gz.part` is never downloadable. Internal components remain canonical for the existing restore validator; the bundle is a derived immutable deliverable built once. Avoid an alternate on-disk bundle-only format, lazy cache expiry or multiple codecs in this change. Approximate disk use is component bytes plus bundle bytes, close to twice current compressed storage; disk reservations must include both.

New active records remain `type: 'full'`, with no parent, chain root or selected tables. Add bounded optional `format_version`, `bundle_size_bytes`, `bundle_sha256` and fixed internal bundle filename metadata. Component sizes/hashes and media count remain. Do not store full paths supplied by a client. Existing `included_hashes` may remain for manifest compatibility/catalog checks but has no ancestry role.

Separate an active full record from a legacy record at the type boundary. Missing/unknown/non-full type or contradictory ancestry/selection must not normalize to full. Preserve raw legacy indicators sufficiently to explain refusal and save history during restore. Additive metadata changes only: no startup rewrite/delete of old rows, files or manifest versions; no broad table reset or migration flag bypass. Retiring the parent index is optional and not required to simplify execution.

Publication ordering: durable components -> durable manifest -> durable bundle -> ready DB metadata. Before this boundary, failure cannot publish ready. After uncertain metadata publication, preserve artifacts and reconcile the exact record/generation; never delete a possibly ready bundle merely because a response was lost. A record stuck creating/failed after an ordinary crash is not an ordinary-site recovery fence.

## 4. Legacy compatibility policy (confirmation gate)

| Artifact/record | Target behavior |
|---|---|
| New versioned full bundle | Download/import/restore normally after validation |
| Existing ready full three-file snapshot with valid metadata | Restore using current components; package once on first bundle download without changing the original snapshot |
| Legacy full split external files | Existing full-only backend import stays available; synthesize new metadata after current validation |
| Old incremental or partial local snapshot | Visible, preserved, marked unsupported; no normal restore, bundle packaging or consolidation |
| Unknown type/version or contradictory full metadata | Explicit unsupported/incomplete error; preserve evidence; never default to full |
| Old nonterminal restore journal/artifacts | Existing conservative classifier continues; retired phases/formats remain recognizable |

A self-contained full assertion must be validated, not created by dropping `parent` or `included_tables`. Legacy external pairs without a manifest remain an explicit administrator-trusted compatibility input, as today; absence of metadata cannot prove full table coverage. Explain that limitation and still enforce SQL/media validation. New bundle imports require a manifest and explicit full type/version.

To recover an old non-full snapshot, use an operator-approved isolated copy with a compatible release and all required ancestors, verify the restored DB/media, then create a fresh full snapshot for import. Do not claim the old media GET consolidates chains; source assessment shows it does not. A new converter requires a separately reviewed task, not retaining the old chain engine behind the main UI.

Pruning is suspended while any non-full/unknown/contradictory record is present, including non-ready legacy records. This small metadata check protects full bases without recursive ancestry. Explicit deletion of full bases is also blocked while such legacy evidence remains. Do not implicitly retire legacy evidence through failed-import cleanup. Operator approval is needed to archive/retire legacy history; until then warn about disk growth.

## 5. Resource and stream contract

Preserve current component limits unless separately approved: expanded SQL 128 MiB, compressed DB 256 MiB, media archive/expanded tar 2 GiB each, 20,000 originals/40,000 inner entries, manifest 4 MiB, history 128 records/16 MiB, reserve 512 MiB, 5-minute transfer/pipeline deadlines and 30-minute restore deadline. Recheck the actual constants before coding. Chain depth ceases to be an active backup resource when chain execution is removed; legacy recovery readers keep their independent bounds.

Add a **separate** bundle envelope budget rather than treating a valid combined artifact as a DB file or arbitrarily raising SQL/media caps:

- Member payload maximum = compressed DB cap + media archive cap + manifest cap.
- Expanded outer tar maximum = member payload maximum + 64 KiB framing/padding.
- Encoded bundle maximum = expanded outer maximum + 8 MiB gzip overhead allowance.
- Exactly three regular members; actual member bytes independently capped; no nested filesystem paths in the outer envelope.
- One heavy job, no queued package builds, existing maximum eight ready download readers, no additional unbounded waiter/promise/metadata map.

These are proposed conservative finite ceilings, not measured performance guarantees. Validate arithmetic, safe integers, tar/gzip overhead, existing helper maxima and proxy limits. The existing `streamToFile` rejects limits above the media cap: introduce a narrowly bounded envelope path/helper rather than weakening every caller. Track combined staged bytes under the serialized job and include other owned leftovers in headroom decisions.

Import disk allowance includes uploaded envelope + unpacked compressed members + expanded SQL + extracted verification media + final components/bundle and reserve. Restore keeps its existing SQL/safety/old-new originals/variants allowance. Package legacy full files must also reserve the new envelope. Recheck free space during writes, reject on actual byte counts (not Content-Length alone), settle all writers before owned cleanup, and preserve unknown artifacts.

Use paths/fresh streams, backpressure and streaming SHA-256. No `readFile`/Buffer of whole SQL/media/bundle, sync codecs, shell `tar`, arbitrary SQL splitting or member lists growing without caps. A 4-MiB bounded manifest buffer is acceptable. App streaming does not prove bounded DB `/import` memory; measure separately.

## 6. Consistency, privacy and recovery

Keep the media publication lease through DB export and original collection/packing; refuse outstanding publish/delete claims. Originals are immutable while that lease is held. Ordinary content edits need not be globally paused for a backup; this plan does not promise a DB+filesystem atomic transaction or invent a new full-site backup maintenance window. Verify supported export semantics and DB/media pairing; unsafe or unverified pairs cannot become restorable merely by wrapping them in a bundle.

Every backup route uses current superadmin authorization; mutations retain same-origin/CSRF policy. Downloads are private/no-store, with safe fixed attachment naming. Files request 0600/directories 0700; verify actual mount enforcement. Bundle checksums detect corruption, not trusted provenance or signatures. DB exports contain account data and may include credential artifacts; never log SQL, archive contents, session/MFA secrets or status tokens.

Access day files, access migration receipts, `.env`/runtime configuration, setup authority, restore journals, safety directories, temporary exports and image variants are **not** bundle members. Activity/error/group DB tables remain included. Restores retain existing historical access-table migration refusal; packaging must not erase that distinction.

Snapshot read/delete coordination is small, bounded and process-local under the supported one-app deployment. Hold the read lease through actual stream closure; deletion/pruning refuses or skips leased snapshots, including during legacy packaging. Open/check immutable sources safely; stale readers cannot delete artifacts, and new restore generations cannot publish an old detached rebuild. Cross-process password-reset job exclusion remains independent. No support is implied for external operators deleting files during active download.
