# Spec 03: Media privacy, bounded processing and storage consistency

Tasks: **REV-1.5, REV-1.6, REV-3.1, REV-3.2, REV-3.3**, plus restore-path acceptance in **REV-2.4**.
Findings: F-03, F-08, F-10, F-12, F-14, F-16, F-18, F-19.

## 1. Existing behavior to preserve

Hash-addressed originals, three WebP variants, optional perceptual deduplication, ownership/private visibility, same-site/local access options, uploaded metadata, supported document/video types, and public media URLs remain. SVG/HTML-like active content must retain forced attachment plus restrictive CSP/nosniff behavior. Do not restore SVG URL importing while refactoring transport.

## 2. Privacy and caching (REV-1.5)

- Original and variant permission checks use the current identity resolver from spec 01.
- A permission-check DTO must include visibility and relevant owner fields. Missing policy fields are an error/deny, not `public` through normalization. Include them in the ZIP query and any similarity/dedup candidate selection.
- Restricted media, authenticated-only/site-private media and downloads use `Cache-Control: private, no-store`; append `Vary: Cookie` (and existing hotlink-related headers) without overwriting prior values.
- For public originals/variants, **do not promise year-long immutable caching while visibility is mutable at a stable URL**. Initially use a revalidating/no-store policy unless an actual versioned URL plus revocation-aware proxy policy is implemented. Document that already distributed public bytes cannot be recalled.
- A public-to-private transition must invalidate application caches and provide operator instructions to purge existing CDN/proxy entries. New headers cannot retroactively evict old responses.
- Nuxt Image/IPX is removed; rendering uses authorized original URLs and Sharp-generated variants. Verify the production bundle has no IPX transform handler, and legacy transform URLs cannot fetch restricted sources or bypass site visibility. Purge historical proxy/CDN transform entries when deploying.

Acceptance: owner fetch of a private original and thumbnail followed by an anonymous/shared-cache fetch cannot return the bytes; the same holds after visibility/site-mode changes. Test actual response headers and a proxy/cache fixture, not only helper booleans.

## 3. Archive downloads (REV-1.5)

The installed Archiver 8 is ESM with named `ZipArchive`; the legacy factory invocation currently throws. Use the actual installed runtime API and correct types, then test a real archive.

- Maximum 200 normalized, unique hashes per archive, plus finite total source bytes and job/disk limits.
- Fetch policy fields and reject/omit unauthorized files according to a documented response contract. Do not reveal private names, existence or paths through errors.
- Save archive owner ID, auth epoch/policy context, creation/expiry and readiness in bounded persistent metadata. The random filename alone is not authorization. Getter checks current identity/ownership and expiry.
- Publish a completed ZIP atomically; use temporary filenames while writing. Cleanup must not delete active archives. Ready public-looking paths remain owner-protected.
- Handle both output and archive errors, source warnings, cancellation and finalize failure. Destroy both sides, wait for closure, unlink only this job's temp artifact, release admission.
- Preserve traversal-safe ZIP entry names, Content-Disposition sanitization and safe source resolution.
- A single-file redirect still relies on the media route's full permission policy.

Acceptance: genuine two-file ZIP round trip; private-file selection by another author; another user fetching a known ZIP URL; disk-full/missing source/client disconnect; cleanup while archive is active; expired/partial archive inaccessible.

## 4. Upload and image pipeline (REV-3.1)

Replace both media/admin `readMultipartFormData` paths with a shared bounded streaming parser. Backup uploads have useful patterns but their error handling must not be copied blindly.

1. Authenticate and acquire an allowed mutation/job context before writing durable state.
2. Enforce total request bytes, file count, per-file bytes, field bytes and timeout while streaming; Content-Length is only a preliminary hint.
3. Stage in an owned temporary directory with exclusive filenames, count streamed bytes and compute SHA-256 incrementally.
4. Validate declared MIME, extension and actual decoder/sniffed content as appropriate. Reject oversize files before reading them into RAM.
5. Submit file paths to the globally bounded image queue. Waiting requests retain descriptors/paths, not complete Buffers; temp-disk reservation is separate.
6. Use Sharp file input and `toFile`/streamed output; obtain output size/dimensions from the operation result where possible. Include metadata/pHash work in the same admission slot and explicit pixel limit.
7. Preserve `animated:false` behavior unless changed intentionally. Apply decoder limits consistently to metadata, transforms and perceptual hashing. Do not assume `sharp.concurrency(1)` serializes jobs.
8. On abort/limit/parser/decoder/disk error, settle once, stop/unpipe all streams, await pending closures, and remove only owned temp files. No unhandled promise/event errors.

The MIME/file-count settings and API `results` contract remain compatible. Any early whole-request 413 versus per-file rejection behavior must be specified and tested. Update proxy guidance: current Nginx 100 MiB does not replace application limits and is too small for the separately advertised multi-GiB backup import limit.

Acceptance: capped chunked requests without Content-Length; excessive parts/fields; slow uploads; duplicate parts; disconnect mid-stream; highly compressed oversized-pixel images; multiple concurrent jobs under a memory cap; valid ordinary image/doc/video uploads and dedup regression.

## 5. Query and search plan (REV-3.2)

- Apply privacy/owner predicates in SurrealQL before pagination and ranking. Query only list DTO columns, not variant/reference payloads unless the UI needs them.
- Translate supported filters using bound values. Sort keys are an allowlist; always add an ID tie-breaker. Validate finite integers/ranges. Retain the existing page API for compatibility, with a finite offset cap or explicit cursor transition for deep scans.
- Fetch total using a bounded scalar aggregate; distinguish an unavailable count from zero. A count query can still scan many DB rows, so inspect `EXPLAIN` and bound its execution.
- FTS/fuzzy search uses a bounded candidate stage; do not rebuild a whole-library vocabulary per request. Add persistent media search terms or bounded candidate lookup only after documenting update/rebuild behavior.
- Perceptual matching initially scans only `{ id, perceptual_hash }` in bounded pages with work limits and authorized candidates. It must not return another user's private record or metadata, even for an identical public upload.
- Remove unrestricted V8 RegExp matching of user patterns. Prefer documented non-regex filters; if regex is retained, use a linear-time compatible engine, pattern/subject limits and explicit unsupported-syntax errors. Query-level timeout cannot interrupt synchronous catastrophic backtracking.
- Orphan list supports paging. A supplied hash selection goes into the SQL filter; an empty/invalid submitted selection must **not** turn into delete-all.

Acceptance: fixtures cover every existing filter/sort/folder/tag/owner combination, exact/fuzzy matching and privacy; source/query instrumentation proves one-page requests do not select the entire files table; ReDoS-shaped patterns return promptly.

## 6. Publication, references and deletion (REV-3.3)

A database transaction cannot atomically publish filesystem objects. Use an explicit claim/state protocol and idempotent repair:

- Serialize work per hash within the supported single-writer process, with finite lock-key lifetime. Database uniqueness remains the final cross-request guard.
- Stage originals/variants under a per-job path. Only publish after ownership of the database/file operation is established. Never delete a final shared path merely because this request's CREATE failed.
- Define states such as `publishing`, `ready`, `deleting` and claim/lease identifiers. All readers and reference writers honor them. Existing records migrate to ready without deleting files.
- Cleanup conditionally claims an unreferenced file, rechecking ownership, age, `reference_count` and `referenced_by` in the same atomic operation. Reference creation must reject or retry against a deleting claim; a recheck followed by an uncoordinated unlink is still a race.
- Delete disk objects idempotently, then finalize record removal. Disk/DB errors leave a diagnosable retryable state, not a record that falsely points to a usable file.
- Bound each cleanup page and cumulative response. Return counts and a finite list of failure identifiers/reasons; do not return every deleted MediaRecord. Coordinate any required UI response change.
- Audit post blocks/cover/avatar and version references; do not assume one reference helper is the only writer.
- Dedup policy explicitly preserves privacy and ownership. An unauthorized identical/private match must not disclose it or silently attach it to a public post.

Variant regeneration must use the restored file's original timestamp/path scheme or atomically update `variants` metadata to newly generated paths. Current code generates under today's month and discards the returned metadata. Regeneration uses the same global image queue and maintenance generation guard, so an old worker cannot publish into a newer restore.

Acceptance: concurrent same-hash uploads; winning CREATE plus losing cleanup; new reference racing cleanup; orphan state changed during pagination; interrupted publication/deletion and restart; missing originals/variants; preserved historical-month URLs after restore.

## 7. Startup migration safety (REV-1.6)

A missing/different `__media_storage_version` is not permission to delete `files` or reset operator settings.

- Fresh empty DB may initialize metadata.
- Supported historical layouts convert in bounded, verified steps without discarding records/originals.
- Unsupported/corrupt layouts fail closed with an actionable migration/recovery message and preserve data.
- Write completion markers only after conversion/verification. Reentry does not undo custom settings.
- Restored historical data receives the same treatment; do not repair tests by inserting the latest marker unconditionally.

## 8. Final acceptance

- [ ] Privacy, ZIP API and stream lifecycle tests pass on Node 22.
- [ ] Query/page/decoder/queue limits are measurable and documented.
- [ ] No losing upload or cleanup race can remove a referenced or successfully published object.
- [ ] Restore and startup preserve old media/paths/settings or refuse safely.
- [ ] Linux filesystem/permission/disk-full tests and isolated real DB claim tests pass.
