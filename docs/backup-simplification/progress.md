# Full-only backups: progress and evidence

**Read first when resuming.** Requirements/tasks are in [plan.md](./plan.md), contracts in [specs](./specs/00-architecture.md), verification in [acceptance-test.md](./acceptance-test.md), and target guidance in [operations.md](./operations.md). Update this ledger at durable checkpoints; do not rewrite task definitions to imply progress.

## 1. Current state

- User requested a **detailed plan**, full backups only, removal of partial/incremental complexity, and DB/media in one compressed download.
- Scope interpretation: remove both incremental-media and partial-table active modes; preserve restore safety and existing full data.
- **Implementation in progress (not release-ready).** The subsequent user request to implement this plan approves its recommended decisions, including prebuilt bundle disk cost and preserved-but-unsupported legacy non-full backups. No data operation or deployment is authorized.
- Implemented archive: strict version-1 `.tar.gz` with exactly gzipped DB, media tar and manifest; matching single-file multipart import. Prebuilt bundles accompany the canonical components; old full snapshots package lazily without changing original bytes.
- Full-only create/restore/retention and simplified en/zh-CN UI/settings are implemented. Chain/consolidation/delta producers and partial table-list route are removed. Mandatory restore protections, old recovery metadata and current scoped/privileged authority are retained.
- **BK-07 and complete task acceptance remain blocked/partial**, especially production builds, two-instance HTTP round trip and Linux fault coverage. Do not declare the detailed plan or release complete from the passing lower-tier checks.
- Recommended BK-D01–07 approved by the implementation request. Existing storage and configured application data remain untouched; verification uses owned temporary fixtures only.

## 2. Task status

| Task | Status | Evidence / next action |
|---|---|---|
| BK-00 | approved; docs checked | Implementation request approves recommended decisions; 7 documents / 40 local links checked |
| BK-01 | regression foundation implemented | Durable DB-free/H3/FS regressions, meaningful baseline failures; supported Node and real DB fixture exercised |
| BK-02 | implemented; acceptance partial | Codec/schema/stream/byte/fault units pass; Linux permissions/publication/process faults and full deadline matrix pending |
| BK-03 | implemented; local unit/DB evidence | Full worker/bundle publication; count pruning and read/legacy holds; real DB preserves unknown rows/bytes across restore; ambiguous-publication fault proof is unit-tier |
| BK-04 | implemented; acceptance partial | Unified GET/HEAD, lazy package/reconciliation, single-file ingestion, full adapters; real H3 disconnect/leases; real Nitro multipart transfer/A-to-B matrix still pending |
| BK-05 | implemented; local unit/DB evidence | Full/empty/imported/legacy-full commits and full-source paired rollback; independent safety units rerun; new Linux destructive-process matrix pending |
| BK-06 | implemented; dev/browser evidence | Both languages, one note/create/download/import, mandatory protection text, authenticated SSR list, 360px checks; production-built acceptance blocked |
| BK-07 | blocked; handoff recorded | Node22 quality and guarded DB pass; full production build exceeded owned 180s deadline; remaining mandatory local/operator gates below |

## 3. Decision register

| ID | Decision | State |
|---|---|---|
| BK-D01 | Full-only means retiring both incremental media and partial-table generation | Approved by implementation request; implemented |
| BK-D02 | `.tar.gz` three-member portable envelope; no ZIP/second new format | Approved; implemented as strict version 1 |
| BK-D03 | Preserve components and build bundle before ready; legacy full packages lazily once | Approved; implemented; finite overhead measurements below |
| BK-D04 | Existing non-full/unknown snapshots preserved but unsupported; no runtime chain converter | Approved; explicit refusal/preservation verified locally |
| BK-D05 | Suspend auto-pruning/full-base deletion while unsupported legacy evidence exists | Approved; implemented; no legacy retirement authorized |
| BK-D06 | Full-only split GET/import backend adapters remain; consolidation removed, UI single-file only | Approved; implemented |
| BK-D07 | Remove partial default setting; validation mandatory, saved safety=false refusal preserved | Approved; explicit safety-enable action, retention save never coerces false |
| BK-D08 | Restore journal/drain/paired rollback/current auth/CSRF/keys/access receipts remain unchanged | Required safety boundary |

## 4. Assessment evidence (source inspection only)

Baseline revision: **`ff4a890`**. Planning shell: Windows/Git Bash, default Node **v24.15.0**. This is not supported-Node execution evidence. Source inspections included:

- `server/utils/backups/{create,config,registry,chain,restore,importExternal,upload,download,streams,tarStream}.ts` and backup API handlers.
- Backup page/dialogs, settings helpers/PUT, schema definitions, locale/call-site searches, existing unit and guarded integration test inventory.
- Existing backend plan definition-of-done, backup/verification specs/harness/runbook; maintenance restore contract; runtime identities/environment; logging current access-file policy and historical backup spec; project README and documentation layout.

Confirmed behavior/findings:

1. Three create modes exist; incremental DB is already full and only media is a delta, while partial DB is selected tables with base media.
2. The UI offers a consolidated incremental media download, but its handler currently returns only the snapshot's own media archive; this must not become a falsely advertised standalone bundle.
3. Restore has chain/partial staging plus independent safety/journal/auth/cache protections; remove the former, preserve the latter.
4. Imports are streamed split parts and already require self-contained full snapshots; a bundle adapter can reuse validation.
5. `default_excluded_tables` is partial UI configuration, not actual full table filtering.
6. README retention/variant descriptions are outdated relative to current pruning/owned variant regeneration.
7. Combined envelope size can exceed current `streamToFile` media ceiling; use a separate bounded envelope path, not generic limit loosening.
8. Existing setting range (1000) and bounded history (128 records) remain an independent operational mismatch; no automatic expansion authorized.

**Planning-session scope only:** no DB/application/CLI recovery/build/browser test or deployment was performed then. No user `.env`, DB, storage, keys or archives were used as fixtures. Existing untracked `pandablog-latest.tar.gz` was left untouched.

## 5. Documentation verification (historical planning checkpoint)

- Validation passed: **7 documents, 40 local links, 1 linked anchor, 8 ordered task definitions and 41 acceptance rows**. Dependencies refer only to earlier defined tasks.
- Final validation after README/ledger edits passed: all 40 package links plus 2 README proposal links, task/ledger consistency, dependency order and 41 acceptance IDs. Explicit new-file trailing-whitespace/final-newline checks and `git diff --check` passed.
- Seven-file package: plan, progress, acceptance, operations, architecture, bundle/API, UI/restore. README links to the proposal without claiming changed runtime behavior.
- Application tests: **not run; docs-only request**. Historical test evidence from other ledgers is not reclassified.

## 6. Acceptance / release state

| Group | State |
|---|---|
| A — Bundle codec | Windows real FS/streams + injected abort/headroom/ENOSPC pass; Linux/perms/process/deadline exhaustive coverage pending |
| B — Creation/registry/retention | Units and actual scoped/ROOT fixture pass; full capture/ready ordering/legacy preservation/history SQL exercised; actual lost-publication transport fault pending |
| C — Download/import | H3 GET/HEAD/header/disconnect/lease units, multipart unit modes and real DB imports pass; actual full Nitro multipart/A-to-B and all auth/CSRF/concurrency transfer cases pending |
| D — Restore/crash safety | Real full/empty/imported/legacy-full commit + full paired rollback pass; existing drain/journal/safety units pass; new Linux/process interruption acceptance pending |
| E — UI/settings/docs | Actual owned full Nuxt **dev** browser en/zh-CN + authenticated SSR/mobile/API gates pass; production-built UI matrix blocked |
| F — Combined local verification | Lint/typecheck/unit/guarded DB/whitespace pass; production full build failed deadline; mandatory remaining matrix not waived |
| G — Operator production gates | pending; outside planning/code authority |

Existing backend/maintenance/runtime plan gaps remain independent and unchanged. No release-evidence entries are created by this plan.

## 7. Session log

### Planning session: documentation only

- Assessed current source and documentation rather than proposing UI-only removal.
- Drafted dependency-ordered BK-00–07, three focused specs, acceptance matrix, draft runbook and this evidence ledger.
- Chose a minimal full-only runtime plus explicit legacy preservation policy instead of retaining a hidden chain engine; choices remain proposed until confirmed.
- Added single-file import to make the download a practical portable backup, without automatic restore.
- Documentation validation passed at the stated tier; added a clearly proposed README entry for discoverability. No runtime files changed.
- Remaining next-session action: user approval of proposed decisions before BK-01. No implementation, data operation, commit/push or deployment performed.

### Implementation checkpoint: BK-00/01 and codec foundation

- Rechecked baseline `ff4a890`; pre-existing README/planning edits retained. Inventory: chain consumers were create/restore, DB GET and guarded streaming tests; table listing route was partial-dialog-only; recovery retains old consolidate job/phase metadata. Shared schema/runtime/media catalog and paired rollback are independent and retained.
- Added unignored `tests/unit/backups/full-only.test.ts`. On Node **22.22.0**, baseline feature regressions produced **4 failures / 15 passes**: missing/unknown type incorrectly full; unsupported format discarded; bundle metadata discarded. Initial missing-contract import was corrected before recording these meaningful feature failures.
- Added strict create/full contracts and versioned manifest, plus streaming bundle codec and bounded snapshot reader coordination. Codec uses installed tar writer and a bounded 512-byte framing reader because permissive tar parsers accept trailing archives/metadata. Fixed destinations only; no archive pathname extraction.
- Codec targeted run: Node **22.22.0**, Windows, `node node_modules/vitest/vitest.mjs run tests/unit/backups/bundle.test.ts`: **20 passed** (exact member/empty-media bytes; malformed structure/types/path aliases; duplicate/missing/truncated/trailing archives; injected byte caps; pre-abort; exclusive publication; strict schema). This is FS/unit evidence, not complete A1–A7: disk-full/permissions, mid-stream abort/deadline, Linux publication/fault gates still pending.
- Publication implementation uses an exclusive hard-link from synced `.part`, then directory sync and owned part removal rather than overwrite-capable rename; published target is preserved on sync uncertainty. Verify mount support before deployment.
- Full-only create and conservative registry/retention changes in progress; no task completion or release claimed yet. Guarded real DB binary and Node22 toolchain available in OS temp, not application storage.

### Implementation checkpoint: coordinated BK-02–06 runtime and verification

**Environment:** Node **22.22.0**, Windows **10.0.26300**, SDK **2.0.3**, SurrealDB **3.2.4+20260803.93ab219**, Nuxt **4.4.8**, Nitro **2.13.4**, H3 **1.15.11**, tar **7.5.16**, Vitest **4.1.6**, Playwright **1.60.0**. Versions were read from installed packages and the guarded DB, not inferred from ranges. All DBs/processes/archives/storage were owned generated fixtures. No user `.env`, configured DB/storage, archives, receipts or deployment operated on; no commit/push.

Implementation:

- Added focused `contracts`, `manifest`, `bundle`, `snapshot`, `package`, `publication`, `snapshotReads` helpers. Outer parser holds one 512-byte header, accepts only ordinary fixed-name regular ustar members, rejects aliases/extra types/metadata/duplicates/trailing archives and checks compressed member hashes/sizes before inner validation.
- Kept component ceilings; independent envelope ceilings are **2,428,567,552 encoded / 2,420,178,944 expanded bytes**. Five-minute stream budgets and eight nonqueued reader slots remain. Members/encoded/expanded bytes checked on actual streams, with disk reserve checks. Custom unpack destruction now waits for in-flight open/write/sync work before removing its owned stage.
- Full creation/import writes durable canonical files/manifest/bundle before ready. Lost ready replies reconcile only exact metadata for this generation; unconfirmed publication never relabels a possibly ready row as failed or deletes its artifacts. Legacy package retries validate an exact existing target, never overwrite unknown targets or mutate original components/manifest.
- New strict note limit stays 500. Optional bounded `source_id`/`source_note` provenance preserves source identity and the historical 2000-character split-import note limit. Absence of a legacy manifest remains an explicit administrator full-coverage assertion, not proof of omitted-table completeness.
- Conservative registry preserves missing/unknown types and contradictory ancestry/selection/version. Private WeakMaps preserve raw history rows and native record IDs (including numeric IDs), retaining unknown fields/types during pre-wipe reconciliation without exposing raw DB objects in API output. Bundle fields are additive; no destructive schema migration/index retirement.
- No chain/hash-union/consolidation/table-list executor remains. Old consolidate job/phase strings and old preparation artifact names remain solely for conservative recovery/status compatibility. Current rollback/auth/cache/variant/schema/runtime-authority ordering is retained.
- Legacy evidence holds pruning and normal deletion; creating/restoring/publication-ambiguous records cannot be manually deleted. Known eligible deletion checks directory/files and refuses unknown artifacts; filesystem failure is not swallowed. Snapshot leases prevent unlink during download/package reads.
- One native streamed browser download (GET after explicit HEAD probe), one import input, one note-only create. Authenticated `useRequestFetch` SSR list/status forwarding, client-only timer disposal, unsupported/retention hold/packaging UI, no restore skip switches; explicit enable-safety action only. README/current runbooks/route matrix updated without rewriting predecessor historical outcomes.

Durable tests and evidence:

- New unignored `tests/unit/backups/{full-only,bundle,bundle-faults,retention,package,create-http,download-http,import-ownership}.test.ts`; updated create/settings/restore-schema/upload and guarded restore/streaming fixtures. Replaced obsolete mode successes without deleting paired rollback/drain/session/cache protections.
- Final supported-Node quality command: `npm run lint && npm run typecheck -- --dotenv=false && npm run test:unit -- --maxWorkers=4 && git diff --check`: **lint/style drift pass; typecheck pass; 122 files pass / 1 skipped, 1394 tests pass / 18 skipped; whitespace pass**. `--dotenv=false` deliberately avoids configured env loading.
- Guarded command: `npm run test:backend:integration -- --fixture --surreal-bin=C:/Users/huipa/AppData/Local/Temp/pb-hardening-surreal-3.2.4.exe`: **12 files / 23 passed**. Actual full/empty/imported/legacy-full commits, legacy lazy packaging/original manifest preservation, full post-media paired rollback, current runtime password/epoch/historical variants, staged graph validation and legacy row/bytes preservation/pruning hold are exercised. Not a two-instance Nitro HTTP transfer proof.
- Real H3 tests cover safe GET/HEAD headers/length, refusal before packaging/auth-before-access, retired consolidation queries, 32-MiB backpressure/disconnect, eight-reader admission and deletion/prune interleavings. They use mocked current-auth/registry gates; they are not proof of every current-role/epoch/middleware case.
- Actual owned full Nuxt dev/browser command: `node --import=tsx scripts/backend-hardening/maintenance-app.ts --fixture --profile=full --mode=dev --surreal-bin=C:/Users/huipa/AppData/Local/Temp/pb-hardening-surreal-3.2.4.exe`: **pass twice** (API gate additions verified in the final dev run), en/zh-CN authenticated SSR list, single create/import controls, no skip switches, 360px layout, real anonymous GET 401 / cross-origin import 403 / retired create 400 / authenticated missing HEAD 409, watcher reload and destructive restart fence. Fixtures retain production ten-minute job-only hold, so actual create/import/restore through browser is not claimed.
- Full production attempt using the same owned source-copy harness with `--mode=build`: **failed the harness's 180-second build deadline** during Nitro bundling after Vite server completed (~22.7s); no production browser/module success claimed. WSL exists, but no supported Linux Node/DB/dependency toolchain was provisioned this session; previous-session Linux results are not new evidence.
- Documentation package recheck: **7 documents / 40 local links / 8 ordered task definitions / 41 acceptance rows** valid. Normal repository-config `git diff --check` passes (Windows EOL warnings only); an extra forced `core.autocrlf=false` probe reported CRLF artifacts, not source whitespace changes, and no broad line-ending rewrite was made. New test/code paths are unignored. Source inventory finds no retired producer consumers; old metadata/recovery readers retained intentionally.

Failed probes and corrections (not hidden passes):

- Initial focused suite: obsolete settings/mode mocks failed; corrected fixtures for explicit full manifests, strict retired-key refusal, meaningful async update promises and one-source restore component mocks. Restore safety cases retained and rerun.
- Initial real streaming graph probe expected deleted-node relations to remain; actual 3.2.4 cascades those edges. The fixture now explicitly creates an orphan relation and independently verifies staging rejection; real suite rerun passes.
- Real H3 tests exposed missing HEAD registration and a disconnect promise leak: H3 only resolves Node streams on end/error, not plain destroyed close. Added explicit HEAD adapter and disconnect error/actual handle closure; regression passes.
- Final source audit added three failing high-bit tar-header alias regressions: Node ASCII decoding masks bit 7, accepting byte aliases in names/size/magic. Switched to strict UTF-8 decoding and octal padding grammar; all three reject and the full codec/unit/real-DB suites pass. No header/path alias can become a different accepted member through ASCII masking.
- Added native numeric-ID preservation to raw history reconciliation; unit binding checks and real 3.2.4 restore independently confirm the numeric legacy row is not rewritten as a string-ID row.
- Added real-FS import-stage EEXIST preservation and synthetic restore-stage EEXIST preservation: cleanup requires proof this worker actually created the stage. Unknown existing stages remain untouched; ownership is released after owned cleanup settlement.
- First full run of new fault tests had three five-second timeouts from deep-equality of 2-MiB Buffers. Replaced the assertion with streamed SHA-256 preservation checks (not a deadline waiver); focused faults pass **4/4 in ~0.64s**, subsequent full suite passes. Injected headroom/ENOSPC/abort is not physical disk-full/power-loss proof.

Finite bundle measurement (driver only):

`node --import=tsx scripts/backend-hardening/backup-bundle.ts --fixture` generates **4096 SQL rows / 33,822,563 bytes / 64-KiB chunks** and **16 MiB originals** per case; no external data input. Compressible components **143,265 B**, bundle **7,304 B**, combined snapshot **150,569 B**, pack **14.9ms**, CPU **16ms**, unpack **16.9ms**, sampled driver RSS **143,536,128 B**. Incompressible-media components **16,852,483 B**, bundle **16,794,755 B**, combined snapshot **33,647,238 B** (~1.997x component storage), pack **523.6ms**, CPU **562ms**, unpack **128.7ms**, sampled RSS **154,357,760 B**. Known owned input/component/unpack peak bytes **50,893,613 / 101,099,500** (accounted files, not disk sampling). No universal compression/performance claim. Separate real 96-MiB-class DB streaming fixture also reran, with sampled driver/DB RSS separately printed; neither is a constrained Nitro+DB workload acceptance.

## 8. Next action / implementation handoff

Do not repeat the approval question: recommended decisions were approved by the implementation request. Finish the outstanding acceptance, without changing protections/limits or using configured data:

1. Resolve the owned production-build deadline on a supported fixture runtime and run full/minimal/backups-disabled/no-observers production/browser/module matrix. Current dev/browser checks do not satisfy production-built E/F gates.
2. Build the guarded **instance A HTTP download -> instance B single multipart import -> explicit restore** fixture, including empty and legacy full, current role/epoch/private-state checks and real multipart disconnect/limit cases. Current same-instance worker/import and mocked-registry H3 tests do not satisfy C/F2 completely.
3. Run new codec/package/import/delete and restore process/permissions/symlink/rename/publication fault matrix on owned Linux; include actual post-publication lost replies, slow deadline expiry, disk-full/permission errors and all destructive interruption points. Do not reclassify old maintenance Linux runs.
4. Finish representative constrained application/DB RSS, CPU/disk/transfer/reader workload measurements separately; small codec and driver/DB fixtures are not F5 completion.
5. Review all A–F acceptance rows with their minimum tier before marking BK-02–07 done. Operator G remains outside coding authority: reviewed production copy, mounts/hard links/proxy budgets/legacy retirement/downgrade rehearsal and explicit cutover.

No release-evidence entry or deployment approval was fabricated. Mandatory local gaps are blocked/pending, not waived by unit/FS/dev/browser successes.
