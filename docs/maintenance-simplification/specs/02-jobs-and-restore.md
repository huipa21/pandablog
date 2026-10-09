# Spec 02: Job serialization and destructive-restore recovery

Tasks: **MS-01, MS-03–06**. Approved target; [progress](../progress.md) records evidence. Retain the streaming/validation/rollback contracts in [backend backup spec](../../backend-hardening/specs/05-backups-and-maintenance.md), except superseded general application-ownership behavior.

## 1. Job exclusion is not application ownership

Serialize backup creation, restore, import/registration, legacy-full packaging, deletion/pruning and password-reset CLI operations according to existing contention/resource contracts. The [full-only backup amendment](../../backup-simplification/specs/00-architecture.md) retires consolidation/chain producers, not their bounded recovery evidence or the protections below. A ready immutable archive download need not be a heavy job unless its current path consolidates or mutates state.

- Reserve in process synchronously before first await; fail fast on incompatible contention. Do not queue a restore behind a request lease that the restore is draining.
- Tokens/generations identify jobs, not a persistent ordinary app lifetime. Old release cannot remove a successor or claim false success.
- Preserve cross-process exclusion with `panda password-reset` and simultaneous offline CLI invocations. One application container does not mean every job runs in that process.
- Do not use app/container PID reuse or a wall-clock TTL as sufficient proof that a live job can be stolen.
- Prefer the smallest process-held/atomic job protocol that fits supported platforms. Record the concrete choice and interruption semantics in progress. Do not add distributed coordination or recreate a permanent owner/guard that demands expert review after ordinary nonrestore death.
- Nonrestore lock corruption/IO trouble can return bounded job-unavailable diagnostics. It cannot globally fence startup/ordinary site traffic. A genuinely active reset/import/create blocks incompatible jobs until actual settlement, not until arbitrary timeout.
- An abandoned `.ownership.guard` is not itself evidence of destructive DB/media cutover. Handle legacy guards explicitly; no silent recursive deletion or directory guessing.

Automated abandoned-job recovery must be conservative about live CLI activity, recheck exact ownership and preserve unrelated artifacts. If the protocol cannot safely distinguish live/abandoned jobs, use a supported process-held job lock or narrow offline job remedy; do not make application startup require expert DB-consistency assertions. Selection is implementation work within this scope, not a new multi-app design.

## 2. Restore admission and drain

Ordered flow remains: authenticate current superadmin -> reserve/acquire job -> close ordinary admission synchronously -> drain -> enter private restore-owner context -> stage/validate/safety -> destructive intent -> cutover/verification.

Track operations through actual promise settlement, not HTTP socket close. Inventory includes:

- Whole H3/SSR/local-fetch handlers, including reads that update counts or can observe inconsistent data.
- DB calls whose caller deadline expired but SDK execution is still pending.
- Media uploads/reference edits/publication/deletion and native/FS work.
- Analytics tracking/session/rollup/retention; logging DB writes/delayed flush/retention; download cleanup; deferred migrations/backfills.
- Backup jobs and raw setup-owner transaction execution.

Pause new background starts while restoring/stopping; drain admitted work under a finite deadline. Do not silently cancel already-dispatched writes or release native/FS leases early. Best-effort logging may drop/coalesce according to existing bounded policy, without recursively logging fence failures to the DB.

If drain fails or recent ordinary write execution is uncertain, refuse/abort restore **before destructive intent**, preserve live data and reopen safe ordinary service after verified abort. A caller timeout is not permission to force wipe. The restore's own operations run in an unforgeable in-memory owner scope, not a public query option.

Keep exact health/readiness/static/status exceptions; no blanket `/api/auth`, setup, backup mutation, IPX or Nuxt error-route exemption. Restore status keeps the narrow expiring prevalidated capability; it never authorizes other APIs or an unrelated later restore.

## 3. Durable destructive boundary

Journal preflight progress if useful, but **recovery-required durability begins with destructive intent**, not application startup or job acquisition.

Persist and sync `destructive: true` (or an equally explicit compatible state) **before the first destructive call**: wipe/live import/irreversible schema or live-media replacement. A process killed between journal publication and SQL dispatch still needs conservative restore recovery. Do not publish the flag after wipe or infer progress only from a DB row that wipe removes.

Requirements:

- Accurate phase, job token/generation, artifact paths and state are atomic/durable.
- Pre-destructive artifacts are isolated staging/safety work; no live DB/media replacement occurs under `destructive: false`.
- Audit admission writes, schema/credential repair, registry updates and rollback so every potentially destructive boundary is covered. Harmless backup-status updates do not imply a destructive restore.
- Migration of old journals must use their actual contract. Do not reinterpret unfamiliar states as `false` or overwrite old evidence to fit the new schema.
- Preserve finite file/JSON sizes, path containment, regular-file/symlink rules and directory sync appropriate to platform.

## 4. Restart classification

| Durable state/evidence | Startup behavior | Cleanup/job behavior |
|---|---|---|
| No restore evidence; ordinary writer/guard/job receipt only | Normal initialization; no expert recovery | Ignore retired writer; classify/recover nonrestore job separately |
| Valid interrupted pre-destructive restore, with trustworthy flag/phase and owned staging only | Automatically abort safely, then initialize | Verify old execution is bounded/quiescent where needed; terminal abort first; token-safe release and owned-temp cleanup |
| Valid committed / verified rolled-back / non-destructive aborted journal | Normal initialization | Terminal metadata is informational; bounded owned-artifact cleanup may resume |
| Destructive intent with no verified terminal outcome | Restore-recovery diagnostic service; no ordinary boot migrations or traffic | Preserve journal, paired safety state and old/new media; no automatic wipe/import/rollback |
| Corrupt/unknown journal or restore artifacts plausibly indicating destructive work | Conservative restore-recovery diagnostics | Preserve exact evidence; do not infer safety from missing PID/file or current phase label |

A flag alone is insufficient if the legacy producer could have touched live data before setting it. Characterize legacy formats and filesystem evidence before automatically aborting. A missing journal plus a restore-kind legacy job lock or old/live-media swap artifacts is an ambiguous restore case, not an ordinary writer-only case.

Terminal state is accepted only under the producer's verified commit/rollback contract. If required verified state is missing or contradictory, remain a restore case. A genuinely terminal journal must not block the recovery inspector merely because the file exists.

Pre-destructive restart handling is bounded and idempotent. If a safe DB execution bound requires waiting, show a finite automatic wait with next action; no operator quiescence/data-consistency assertions for a verified non-destructive abort. An IO/permission failure during cleanup may restrict new jobs or report an initialization error; do not turn it into an irreversible generic startup latch. Never remove unknown artifacts to claim success.

## 5. Cutover, completion and rollback

Preserve current archive/checksum/path/chain/partial-replacement validation, expanded-byte/disk budgets, streamed HTTP export/import parsing, staged media and verified paired safety snapshot. Do not return to whole-dump buffers or optional unchecked wipe.

Cutover still repairs current schema/runtime credentials, rotates appropriate auth epochs, preserves saved pre-wipe backup history, swaps media, regenerates historical-month variants under bounded admission, refreshes settings and invalidates privacy/analytics/cache publication state.

- Commit: verify DB/media consistency -> durable terminal journal -> reopen ordinary service -> release job -> bounded owned safety cleanup.
- Verified paired rollback: same ordering and verification before reopening; preserve truthful failure report.
- Ambiguous execution or failed DB/media rollback: retain journal/safety, ordinary admission closed, restore-recovery guidance. No blind replay or broad cleanup.
- Detached image rebuild/backfill may not outlive restore generation and publish into a subsequent cutover. Keep current owner/generation behavior or replace with tested equivalent.

## 6. Uncertain writes and server execution bounds

Retain a **temporary destructive-maintenance hold**, not expert recovery, for lost ordinary write responses. Current window is 10 minutes; specify final defaults and require DB `--query-timeout`/`--transaction-timeout` below it. App response deadlines/closing sockets do not supply that execution bound. Test expiry with bounded/injectable time and restart.

Ordinary startup/requests/writer-independent shutdown are not blocked by the marker. Unreadable/future timestamps may restart a finite conservative window, not create permanent recovery. A normal boot error is not automatically an uncertain-write event; a real lost DB write response can be.

After an ordinary app crash before marker persistence, destructive admission must still account for possibly lingering old DB work: use a bounded process-start hold based on documented server execution limits, or a tested equivalent. Do not pretend absence of a marker proves quiescence. This hold affects backup/restore admission only and is explained automatically; it is not an app-owner receipt or ordinary readiness fence.

The production DB is managed separately. Record how the implementation establishes/configures the supported bound; missing DB timeout validation is a verification/deployment gap, not grounds to force startup-only expert assertions. Do not claim that a fixed delay cancels DB execution.

## 7. Acceptance

See [groups C/D/E/F](../acceptance-test.md): active disconnected save, pending DB write, native upload, log/analytics/deferred work, token-safe contenders including reset CLI, drain timeout, pre-destructive crashes, intent-before-wipe crash, every destructive phase, terminal restart, paired rollback and conflicting legacy evidence. Owned process death tests supplement, not replace, real DB+media round trips and Linux durability.
