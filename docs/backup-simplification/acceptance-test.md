# Full-only backups: acceptance matrix

**Proposed requirements, not test results.** Record evidence in [progress.md](./progress.md). Task ownership is in [plan.md](./plan.md); format/safety contracts are in [specs](./specs/00-architecture.md). Historical full/partial/incremental test passes are baseline evidence only, not acceptance of the new feature.

## Execution rules

Use owned fixtures only: no `.env`, configured application DB, real `storage/`, user archives or deployment. Default units are DB-free. Real integration deliberately uses the [guarded harness](../backend-hardening/harness.md), supported Node 22 and stable SurrealDB 3.2.x (current pins 22.22.0/3.2.4). Record exact installed SDK/Nuxt/tar/OS versions too.

Use deterministic clocks/rendezvous and owned fault injection, not arbitrary sleeps. New tests must be unignored. Real H3/Nitro/browser coverage cannot be inferred from handler mocks. Windows skips of POSIX filesystem behavior are not Linux passes. Missing mandatory local coverage is blocked/pending, not waived.

Suggested new suites: `tests/unit/backups/bundle.test.ts`, `backup-full-only.test.ts`, `backup-download.test.ts`, `backup-retention.test.ts`, plus guarded additions to existing `tests/integration/backup-restore.test.ts` and `backup-streaming.test.ts`. Names are proposals; record actual durable names in progress.

## A. Envelope and archive codec — BK-02

| ID | Required result | Minimum evidence |
|---|---|---|
| A1 | Pack/unpack has exactly DB/media/manifest regular root files, no external dependency; hashes and member bytes unchanged | Real filesystem/stream unit |
| A2 | Strict full/version/schema; missing/unknown version, contradictory ancestry/table selection, invalid sizes/counts/timestamps and excessive metadata reject | Unit |
| A3 | Valid empty-media inner tar round trips; absent/corrupt empty member rejects | Real installed tar/gzip |
| A4 | Outer traversal, absolute/Windows/UNC/backslash/alias paths, duplicate/case aliases, links/devices/FIFO/sparse/unexpected metadata and files reject without writing outside stage | Owned malicious archive FS tests |
| A5 | Actual encoded/expanded/member/entry caps, forged lengths, decompression bomb, bad CRC/truncation/warnings/trailing archive data reject | FS/stream unit with small injected caps |
| A6 | Abort/deadline/disk-full/permission/read errors settle all streams/handles; remove only owned unpublished temps; no partial ready artifact | Fault-injected FS unit |
| A7 | Sync/rename publication is exclusive; manifest/component identity, safe source files and envelope checksum/size are correct; installed tar framing fits budgets | FS unit + Linux publication tests |

## B. Creation, registry and retention — BK-03

| ID | Required result | Minimum evidence |
|---|---|---|
| B1 | Create note-only or literal full succeeds; incremental/partial/parent/tables/unknown input fails before job acquisition, DB row or filesystem changes | API unit + H3 |
| B2 | All current DB tables and all current original files captured; no parent/hash-diff/table-selection calls; pending publication/deletion claims reject | Unit + actual DB/media |
| B3 | Ready appears only after durable components/manifest/bundle; failed package or ambiguous metadata publication cannot delete a possibly ready artifact | FS/unit + actual DB publication |
| B4 | Full-only count pruning keeps newest configured ready snapshots, zero disables pruning, active/leased/ambiguous ones survive; errors do not falsely report success | Unit + real DB changed SQL |
| B5 | Any non-full/unknown/contradictory record suspends automatic pruning and prevents possible full-base deletion; old rows/files stay unchanged | Unit + real DB/FS legacy fixtures |
| B6 | Missing/unknown types never coerce to full; additive bundle fields and legacy provenance survive list/detail/history reconciliation and interrupted-run retry | Unit + real DB |

## C. Download/import APIs — BK-04

| ID | Required result | Minimum evidence |
|---|---|---|
| C1 | One GET sends completed bundle with safe name, gzip MIME, actual length if supplied, private/no-store; non-ready/non-full/unknown/corrupt source refuses | Real H3/Nitro + FS |
| C2 | Current superadmin only; anonymous/non-superadmin/revoked epoch blocked; cross-origin/mixed multipart import blocked by current policy | H3/Nitro auth/CSRF + browser |
| C3 | Legacy full without bundle packages original snapshot once, does not export live DB or mutate original components/manifest; concurrent package calls yield one owner or bounded busy | Owned FS/H3 concurrency |
| C4 | Bundle-only multipart succeeds; duplicate/mixed/unknown/excess parts or fields and streaming limits without Content-Length reject; cleanup waits for every writer | Real streaming HTTP/FS |
| C5 | Existing full DB/media multipart import and raw GETs remain supported; partial/incremental manifests and consolidation query parameters explicitly reject | H3/FS + actual DB validation |
| C6 | Inner hashes/count/catalog and staged SQL independently validated before registration; source id cannot overwrite local snapshot; import creates bundle and does not restore live state | Real DB/FS |
| C7 | Slow/aborted readers respect eight-reader/deadline budgets; download/delete/prune interleavings retain data and release only after actual stream closure | Owned H3/FS Windows + Linux |
| C8 | Corrupt/oversized upload/package failures preserve old ready snapshots and unknown evidence; ambiguous registration is reconciled rather than broad-deleted | Fault unit + real DB ambiguous publication |

## D. Full-only restore and crash safety — BK-05

| ID | Required result | Minimum evidence |
|---|---|---|
| D1 | New full/empty-media/imported full/legacy three-file full restore independently verified; deleted post-snapshot rows absent and snapshot rows/media restored | Actual isolated DB + real worker/FS |
| D2 | Old non-full/unknown/contradictory snapshots refuse before journal/fence/wipe; missing/corrupt component/manifest fails before destructive intent | API/worker unit + actual DB |
| D3 | One-snapshot staging only; no ancestor resolution or partial consolidation; saved current history including bundle metadata wins over snapshot-era registry | Unit + actual DB |
| D4 | Active foreground/background/DB/native/FS work drains; drain failure/uncertainty/new-process hold prevents wipe without ordinary startup latch | Existing safety units + owned H3/DB |
| D5 | Forced post-cutover failure restores matching DB/originals/variants, verifies rollback and reopens only after durable terminal state; failed/ambiguous rollback stays fenced | Actual isolated DB/FS worker |
| D6 | Runtime credentials reverified, sessions/devices revoke, settings/private-cache/analytics publication refresh, historical-month variants resolve, no detached old-generation publication | Actual DB/FS + H3/browser |
| D7 | Crash before intent safely aborts; after intent/before SQL dispatch and every destructive phase fences; terminal journal does not fence; old phase/formats still classify | Owned process faults + Linux/runtime |
| D8 | Safety=false still refuses before intent; validation=false cannot skip verification; missing authority/access migration/media layout gates remain; setup receipt never resets | Units + actual DB relevant cases |

Replace obsolete non-full success tests with refusal/preservation coverage; move paired rollback coverage from incremental fixtures to full fixtures. Do not simply delete rollback/auth/crash tests because their original fixture used a retired mode.

## E. UI/settings/docs — BK-06

| ID | Required result | Minimum evidence |
|---|---|---|
| E1 | Only one create action/note, one download action, one import file input; no type/parent/base/table/chain UI | Production-built browser en/zh-CN |
| E2 | Download -> single-file import -> separate explicit restore UX; progress and errors truthful, legacy unsupported/retention hold explained | Production-built browser + owned DB |
| E3 | SSR backup list carries request auth, no polling during SSR, timers clean up; packaging/non-ready/busy states usable | Actual Nitro SSR + browser |
| E4 | Partial settings removed/legacy saved values ignored; strict PUT rejects retired keys; protections cannot be silently skipped or safety=false coerced; retention bounds unchanged | Unit + API/browser |
| E5 | Keyboard/focus/labels, translated errors/status, mobile 360px + desktop; unauthorized actors cannot reach actions | Browser |
| E6 | README/API/schema/module/runbook descriptions match implementation; narrow predecessor notices; historic ledgers retained, no retired access-log setting | Source/docs link review |

## F. Combined local gates — BK-07

| ID | Required result | Evidence |
|---|---|---|
| F1 | Lint/typecheck/full unit/whitespace pass on supported Node 22; unrelated baseline failures listed independently | Exact commands/results |
| F2 | Guarded stable 3.2.x full worker and A-to-B HTTP download/import/restore round trip, including empty and legacy full, pass | Recorded DB/SDK/HTTP/FS versions/counts |
| F3 | Owned production full/minimal/backups-disabled builds and smoke; relevant logs/analytics-disabled combinations; unresolved restore safety remains in disabled builds | Actual build/Nitro/browser evidence |
| F4 | Linux owned package/import/restore crash/rename/symlink/permissions/deletion tests; no claim of physical power-loss safety from mocks or SIGKILL alone | Actual platform/process evidence |
| F5 | Finite representative compressible/incompressible workload measures app/DB RSS separately, disk peaks, CPU/time/size overhead and reader budgets; existing component caps enforced | Reproducible scale inputs/limits/results |
| F6 | Obsolete chain/consolidation/delta producer references absent from active flow; only documented bounded legacy metadata/recovery readers remain; operations/handoff completed | Source inventory + documentation |

Do not execute a plain production build that picks up user `.env` merely to fill F3. Use the owned application/build harness with a sanitized environment and temporary module profiles. Existing generic Playwright configuration may load application credentials/reuse a server; use an isolated runner instead.

## G. Operator gates — outside code-edit authority

- Approved production-copy rehearsal, trusted archives and same-window DB/media/config/access-log policy.
- Real mounts/UID/GID/same-filesystem rename and free space for added bundles, staged SQL, safety and variants.
- Proxy import size/time limits scoped to backup endpoints; generic 100-MiB limits may be smaller than allowed bundles.
- Legacy non-full recovery/retirement decision and retention hold implications accepted; no old backup silently discarded.
- Deployment-version DB import limits/query/transaction execution bounds and actual constrained memory profile accepted.
- Compatible rollback image/data/config/keys/receipts preserved; no assumption of image-only downgrade.
- Explicit cutover authorization, owner login/private-media/backup smoke and overnight observation afterward.

Passing local acceptance does not satisfy these operator gates or unrelated backend/maintenance plan gaps. Do not change release evidence to make pending gates appear passed.
