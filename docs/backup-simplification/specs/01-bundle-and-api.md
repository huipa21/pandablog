# Spec 01: Portable bundle and API

**Proposed target.** Tasks BK-02–04, BK-06–07. Read [architecture](./00-architecture.md), [restore/UI](./02-ui-and-restore.md), and [acceptance](../acceptance-test.md).

## 1. One portable artifact

Browser filename: `pandablog-<safe-local-id>.tar.gz`. Internal filename: `backup.tar.gz`.

The outer tar contains exactly these regular files at its root:

```text
db.surql.gz
media.tar.gz
manifest.json
```

No directory wrapper, arbitrary path, extra file or external dependency. The media member remains the existing gzipped tar of original `YYYY/MM/<sha256>.<ext>` files. Empty media is represented by a valid gzipped empty tar, **not** an absent media member. Reusing compressed inner components minimizes changes to restore/import; outer gzip uses a low compression level because inner files are already compressed. Measure CPU/size overhead rather than claiming compression savings.

New manifest schema (illustrative example; actual values generated from completed files):

```json
{
  "format": "pandablog-backup",
  "format_version": 1,
  "id": "snapshot-source-id",
  "type": "full",
  "parent": null,
  "chain_root": null,
  "included_tables": null,
  "created_at": "2026-01-01T00:00:00.000Z",
  "note": null,
  "sha256_db": "<64 lowercase hex characters>",
  "sha256_media": "<64 lowercase hex characters>",
  "db_size_bytes": 123,
  "media_size_bytes": 456,
  "media_file_count": 0,
  "included_hashes": [],
  "excluded_tables": []
}
```

Use strict bounded schemas, not unrestricted `.passthrough()` for the new format. Check literal format/version/full, null ancestry/selection, valid timestamp, finite integer sizes/counts and bounded arrays/strings. New notes honor create's 500-character cap. `excluded_tables` preserves historical transparency, not a new user-selectable exclusion feature. Unknown versions reject explicitly, never fall back to legacy parsing. Imported `id` is provenance only; generate a new local id and never construct destination paths from it. Do not embed application environment/keys/endpoint credentials.

SHA-256 applies to compressed DB and compressed media members, matching existing integrity semantics. Verify declared sizes/counts/hashes against actual streamed files/catalog before registration. The bundle's own SHA-256 and total byte size live in the registry (not recursively inside its own manifest). The bundle manifest and sibling manifest have matching canonical content. A manifest checksum is not a signature, and executable SQL must come from a trusted administrator-controlled source.

## 2. Outer archive validation

Outer parsing is separate from media extraction: reusing `extractMediaTar` unmodified would reject the three root member names.

- Stage into a newly owned restrictive directory; assign fixed output paths yourself. Do not use tar entry paths as extraction destinations.
- Accept only the three exact regular-file names, once each. Reject path separators, `./` aliases, case aliases, absolute/drive/UNC paths, backslashes, traversal and duplicate entries.
- Reject links, devices, FIFO, sparse/special entries, directories and unexpected tar metadata entries. Writer uses ordinary short names/no unnecessary PAX records; verify installed tar behavior in tests.
- Count encoded envelope, outer expansion, each member's **actual** bytes and entry count. Tar header sizes cannot substitute for stream counts. Bound long-name/header parsing and all metadata before retention.
- Reject missing/zero invalid components, corrupt/truncated gzip or tar, bad CRC, parser warnings, unsupported metadata and non-archive trailing data. Only bounded valid tar zero padding is allowed; test how the installed parser handles concatenated/trailing archives rather than assuming it rejects them.
- Do not recursively unpack inner media until the outer envelope is complete and verified. Then reuse capped DB expansion, hardened inner media extraction, staged SQL verification and media catalog checks.
- Abort/deadline/disk-full errors close and settle parser, member and file streams before removing only the owned upload stage. No parser can recreate a removed directory afterward.

Pack/unpack APIs accept file paths and injected finite limits/abort signals. Any outer helper may specialize those budgets; it must not weaken the current SQL/media helpers. Include wrong MIME/extension with valid bytes, and correct MIME/extension with corrupt bytes: filenames and MIME are hints, not validation.

## 3. Creation and durable bundle publication

After the current full components are complete and hashed, write the versioned manifest, stream exactly those three files to `backup.tar.gz.part`, finish tar/gzip, sync file, rename to `backup.tar.gz`, then sync containing directory as supported. Only afterward publish ready metadata containing the bundle hash/size/version. Avoid exposing partially created directories as ready based only on file existence.

The creation/import job owns packaging, so no concurrent package worker operates on the same snapshot. Source files must be regular, contained in the expected backup directory, and immutable; validate hashes/metadata on legacy adaptation. No symlink-following source tree or live export during download. Preflight and ongoing disk checks include envelope duplication. Packaging failure means creation/import did not finish; record a truthful error and preserve any publication-ambiguous artifacts.

For existing full snapshots, a first-download package operation reads the original components, verifies their recorded hashes, produces a versioned manifest for the bundle, and publishes bundle metadata without altering original DB/media/manifest bytes. Original legacy manifest remains legacy; its adapted bundle manifest can differ only in normalization/version/provenance fields. This exception to sibling manifest equality is explicit and tested. Building must validate self-contained full status and format/layout compatibility, not execute a restore or consolidate selected tables. A stale `.part` from a dead package is not ready; only confirmed owned remnants may be cleaned.

Legacy packaging is serialized under a `package` job kind, replacing the retired `consolidate` producer. No heavy-job queue. Admission/deadline failure returns a retryable error, not an infinite HTTP wait. Completed bundle streams use ordinary bounded read admission; once a read lease is established, heavy package ownership can release. Retain recognition of old consolidate job/journal metadata where recovery classification needs it.

## 4. API contracts

Every route retains current superadmin authorization and existing request-origin policy. Preserve ordinary 202/polling behavior and the narrow restore status capability.

| API | New target contract |
|---|---|
| `POST /api/admin/backups` | Strict body `{note?: string|null, type?: 'full'}`; optional literal full is for old full clients. Reject non-full, `parent`, `tables` and unknown keys before job/files/row creation. Return existing 202 `{ok,id,...}`. |
| `GET /api/admin/backups/:id/download` | Ready supported full only; stream completed bundle. Legacy full can be packaged once first. `application/gzip`, safe attachment name, private/no-store, correct optional length, finite stream deadline. |
| `GET /api/admin/backups/:id/download/db` and `/media` | Retain thin full-only raw-file adapters for existing full clients; remove heavy work. Any consolidation parameter or non-full record gives explicit unsupported error rather than pretending a full download. |
| `POST /api/admin/backups/import` | New multipart mode: exactly one file part named `backup`. Success remains 201 `{ok,id}` after full validation and registration; no automatic restore. |
| Same import route, legacy mode | Existing `db` + `media` + optional `manifest` accepted for self-contained full only. Never accept both modes in one request. Frontend no longer exposes this mode. |
| `POST /api/admin/backups/:id/restore` | Existing confirmation/replace-only body/status token; refuse unsupported types before journal/fence/destruction. |
| List/details/status | Add optional bundle size/availability/version and conservative legacy/retention-hold diagnostic, preserve existing status shape and polling behavior. Sanitized output, no paths/tokens/credentials. |
| Settings | Retain retention and current validation/safety semantics; retired table-default input rejected for new PUTs, saved legacy keys ignored. |
| `GET /api/admin/backups/tables` | Remove when inventory confirms its only consumer was partial backup creation. |

Recommended errors: 400 invalid request/manifest/layout; 409 not-ready/unsupported-snapshot/busy or legacy retention constraint; 413 byte/member budget; 408 ingestion/pipeline deadline; sanitized 5xx for storage/validation/authority failures as applicable. Unknown version must have an identifiable unsupported-version reason. Auth/visibility errors retain current non-disclosure policy. Do not send response headers for an archive before admission/file validation; a failure after body streaming starts terminates the stream, not a false success JSON suffix.

Multipart limits must accommodate the envelope's separate cap. Stream actual bytes without requiring Content-Length; reject duplicate/mixed/unknown parts and fields. The old broad per-file media cap cannot validate both modes correctly by itself. Deadline, free-space and cleanup settlement apply to all parts. `requireSuperadmin` precedes body ingestion. Existing origin/CSRF middleware must cover the new single-file path; do not add a blanket maintenance exception.

## 5. Download lifetime and snapshot deletion

A ready bundle is immutable. Ready downloads need not acquire the heavy job lock. Use bounded read admission and a narrowly scoped read lease for that snapshot, acquired before reading components/bundle and released after actual stream/file closure. Delete/prune refuses/skips leased snapshots; Windows must not fail midway through removing an open file or pretend success, and Linux must not silently let retention remove a bundle while its metadata is being acquired.

Avoid a time-of-check/time-of-use symlink swap by safe directory/file validation and opening the intended immutable regular file/handle. One-app deployment does not authorize arbitrary external filesystem mutation; document that operators must not edit backups during jobs/transfers. Do not create unbounded per-id read maps; active lease cardinality is bounded by reader admission.

On disconnect/deadline, close producer and output streams, settle file handles, release leases and keep the original ready bundle intact. Failed legacy packaging removes only its proven owned temporary artifact; it never deletes original components. Prune/delete removes all confirmed files for an eligible snapshot together under existing job serialization and truthful error handling, not a broad storage sweep.

## 6. Single-file round trip

Required proof: create on owned instance A -> HTTP download -> single-file upload on owned instance B -> validated local registration -> explicit restore -> independent DB/media/settings/private-content checks. Assert original compressed member hashes survive packaging, new local id does not collide, note/provenance is retained, historical-month variants regenerate, previous cookies/devices revoke, and source/target configuration secrets are not imported by the bundle container. Run empty-media and existing-three-file full variants too.
