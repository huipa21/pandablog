# Spec 03: Legacy artifacts, CLI and deployment compatibility

Tasks: **MS-01, MS-04–06**. Approved target. Do not apply these migration rules to user storage during implementation tests. Read [restore classification](./02-jobs-and-restore.md) and [operations](../operations.md).

## 1. Preserve first; no cleanup prerequisite for ordinary startup

The replacement app no longer uses `.writer.lock` as authority. Startup does not acquire, release, adopt or require archival of it. Existing writer receipts can remain untouched on disk; their presence/contents/host/PID/age do not block normal startup or independently imply destructive restore.

Default legacy behavior is **ignore without traversing/modifying** retired writer paths. A writer path that is a symlink, nonregular object, unreadable record, empty directory or obsolete partial publication is not followed, recursively removed or treated as the new owner's receipt. Permission trouble in that retired path is not a normal-startup requirement. Security/domain errors on paths actually used by the new app still fail appropriately.

Bounded read-only inspection may describe a retired record as informational, without printing tokens/bytes. Optional cleanup is separate, narrowly scoped and operator-controlled; no automatic startup sweep or required confirmation flags. The implementation must work before any such cleanup.

## 2. Compatibility matrix

| Existing artifact | Target disposition |
|---|---|
| `.writer.lock` directory/owner/empty/partial/unreadable/wrong-host/reused-PID | Retired, no readiness/recovery gate; leave unchanged |
| `.uncertain-writes.json` | Temporary backup/restore quiescence only; automatic expiry; malformed/future values produce a finite window, not expert startup recovery |
| `.job.lock` file (old backup implementation) or directory (current) | Classify job kind/ownership; serialize live jobs; abandoned nonrestore ownership cannot block ordinary startup; restore-kind ambiguity checked against restore evidence |
| `.ownership.guard` | Not application lifetime authority; cannot alone demand DB-consistency review/startup fence; migrate/safely replace job protocol without blindly deleting live/unknown paths |
| Nonterminal destructive `.restore-journal.json` | Preserve and block ordinary boot/traffic; actual restore-recovery case |
| Trustworthy pre-destructive journal | Bounded automatic abort/settlement/owned cleanup, then normal boot |
| Verified terminal journal | Informational; no blanket `file exists => recovery` rule |
| `.restore-*` staging/safety/old-media artifacts | Correlate with journal/token/actual paths; clean only proven owned terminal/non-destructive artifacts; ambiguous live replacement remains a restore case |
| Legacy `.safety` dumps/media | Historical restore artifacts, never auto-import or broad-delete; determine whether they imply unfinished destructive work rather than blocking solely on directory name |
| `storage/.recovery-archive/startup-*` | Historical evidence; never loaded as current app ownership or deleted by migration |
| `setup-authority.json`, access-log migration receipts, media claims/layout markers | Independent security/data controls retained; not retired writer artifacts |

An invalid job record can make a specific job unavailable without fencing the entire site. It may not be ignored if it plausibly records interrupted destructive restore. Enumerate concrete old producer formats; no unsupported "all old locks are harmless" heuristic.

Use bounded record sizes/directory scans/path checks. Unknown files remain untouched. Do not overwrite remote/active job metadata or use `rm -rf storage`, recursive receipt globs or a DB reset as migration.

## 3. Recovery CLI

`panda recover` remains a compatible **read-only entry point** for restore-oriented inspection. It must not load `.env`, contact the DB, execute SQL, resume/roll back restores or change records by default.

Required reporting:

- No destructive restore blocker: no expert recovery required; ordinary config/init problems point to readiness/logs and correction/restart. Retired writer receipts are informational, including live-looking/reused/remote PIDs.
- Active maintenance job: informative busy state, not data-corruption proof.
- Temporary quiescence: finite automatic wait for affected jobs, not an expert assertion workflow.
- Verified pre-destructive/terminal evidence: explain automatic handling, not blanket manual recovery.
- Destructive/ambiguous restore: preserve journal/safety/media and link to the restore-specific offline runbook.

Prefer retaining existing report fields/statuses when they can truthfully express the new contract. If statuses or exit codes change, document an explicit mapping in progress, CLI help, [CLI reference](../../versioning-and-cli.md), README and tests. Update API/UI consumers together; do not retain `writer-active` solely to suggest persistent app ownership still exists.

Retire `--archive-reviewed-startup` and its `--app-stopped --database-quiescent --data-consistent` flow as an ordinary-startup remedy. Safe default: reject the obsolete mutating invocation with bounded guidance and **no filesystem changes**; keep plain inspection working. Help must not advertise a required archival workaround for ordinary crashes. Actual destructive-restore recovery may still require DB/operator expertise; do not add a public force-unfence or automatic SQL rollback shortcut.

Bundled/development command paths must match. Recheck `bin/panda.mjs`, `scripts/recover.ts`, `scripts/recovery/assistant.ts`, Dockerfile's `recover.cjs` packaging and any import of backend runtime utilities. The CLI must not boot Nitro or recreate lifetime writer ownership as an import side effect.

## 4. Password-reset CLI

Retain hidden interactive prompts, 8–200-character policy, parameterized update of an existing account, new auth epoch, no username creation, no role/MFA/active-state changes, scoped DB credentials, and refused argument/piped passwords. It is the existing exceptional subcommand allowed to read app config; tests use generated config only.

Its job mutex must still exclude backup/restore/import/consolidation/deletion as appropriate, in both `docker exec` and stopped-app one-off modes. Serialize competing reset CLI processes. A lost reset response is not retried automatically; indicate that the password may have changed and preserve a finite destructive-maintenance hold as needed. A failed marker/release cannot falsely report successful verified cleanup, but must not create a permanent application-startup lock.

Keep current tests for reset auth/unknown user/epoch/uncertainty/packaging and add cross-process contention/restart tests. No actual account password is reset as part of this task.

## 5. Optional modules and compatibility

- Backups disabled: normal boot/traffic still has no writer ownership. Existing unresolved destructive restore is not ignored just because a module flag changed; minimal lightweight restore-state safety loading must remain available without starting backup UI/jobs.
- Logs/analytics disabled: no waits for nonexistent workers; their disabled schema/runtime behavior remains intact.
- Full-feature/minimal single-author builds and touched-module combinations preserve environment names, module data, role/privacy/owner/auth semantics and API shapes.
- Preexisting journals/status capabilities and backup full/partial/incremental/empty-media formats remain readable under their trust limits. No unrelated backup version bump or credential migration.
- Updated messages are translated in English and Simplified Chinese where the existing UI uses i18n. Static startup diagnostics remain escaped/sanitized.

## 6. Deployment and downgrade

Remove writer-recovery hostname requirements from production Compose/help. A fixed hostname can remain for unrelated reasons, but must not be mandatory for ordinary restart. Keep reasonable Nitro shutdown timeout/Compose stop grace for safe drains and actual restore checkpointing; SIGKILL/OOM after grace still has ordinary automatic restart semantics.

Deployment remains stop-before-start, no rolling overlap. One app instance does not grant permission for concurrent administrative DB writes; password-reset is supported through the coordinated job path.

Old images may reject retired writer/job/uncertainty artifacts or interpret new restore state differently. Document compatibility before any downgrade. Preserve image/config/DB/media/receipts, verify paired data/credential/schema compatibility on an approved isolated copy, and never synthesize a "clean" receipt or delete restore artifacts to make an old image start. No automatic rollback/deployment is part of this assignment.

## 7. Active documentation/tooling reconciliation

Update current sections of README, runtime/backend runbooks, startup ownership spec, writer inventory, CLI reference/help, release handoff and executable checker requirements. Add dated/scope-specific supersession notices; keep historical task/evidence logs unchanged except appending new entries.

The release checker's `single-writer` requirement becomes a deployment guarantee, not a writer-lock proof. Its crash gate must distinguish ordinary automatic restart from interrupted destructive restore. Do not mark broader unfinished local/operator gates satisfied, waive them silently, or fabricate `release-evidence.json` records. This simplification can be implemented without completing unrelated backend Phase 4 lanes.
