# Logging operations

This runbook describes the **final Phase 2/3 image**, not the old DB-backed access buffer. See [progress.md](./progress.md) for rollout evidence and the **pending production-copy, scale, Docker and overnight release gates**. Local completion is not production release approval.

## Backend hardening candidate (not release-approved)

Later backend-hardening work is only partially implemented; it does not supersede the
historical logging acceptance or authorize an upgrade. Use its [progress ledger](../backend-hardening/progress.md),
[draft operations runbook](../backend-hardening/operations.md) and
[Phase 5 evidence matrix/checker](../backend-hardening/release-handoff.md). The candidate
adds byte/line/scan bounds and 503 unavailable detail/hourly/stats, while unknown-count purge,
global DB log admission and truthful deletion-report consumers remain unfinished. The older
200K-match reader and count-first purge descriptions below describe logging's completed
Phase 2/3 contract, not a claim that the unfinished hardening image is ready. Never disable
bounds, purge data or bypass migration receipts to make a release check pass.

The historical empty-media backup limitation noted below is corrected locally by hardening
REV-2.4; approved-copy/combined runtime/Linux/operator acceptance is still required. Keep all
logging production-copy, retained-day volume/DB/backup measurements, migration/backfill N,
container/browser and overnight gates pending until actually supplied. Do not rewrite old
progress as if these later results had already been verified.

## Where logs live

| Stream | Durable store | Container console | Admin view |
|---|---|---|---|
| Access | UTC daily NDJSON/gzip files; no `access_logs` table after migration | stdout in effective `all` mode | Logs → Access; UTC hourly chart |
| Errors | `error_groups` plus retained `error_logs` occurrence samples in SurrealDB | stderr in `errors` or `all`, even if error DB storage is disabled/down | Logs → Errors grouped inbox |
| Activity | `activity_logs` in SurrealDB | stdout in effective `all` | Logs → Activity |
| Logging diagnostics | No separate durable store | warnings/errors on stderr | Retention reports also appear in Settings |

Console and storage are independent sinks, not guaranteed identical archives. Access exclusions, excluded statuses and sampling apply to both sinks. The Nitro error-hook threshold defaults to **500**, so ordinary 401/404 errors are ignored; explicit application `logError()` calls bypass that threshold. `/api/health` is always excluded from access logging. Optional/build-time module flags must enable the relevant stream.

DB storage switches (master and per-stream) do not silence console output. They **do** gate scheduled retention: disabling storage also stops scheduled trimming for that stream. Review disk usage before leaving a stream disabled with existing history. Secrets are redacted by configured field name, case-insensitively; do not put secrets in messages, paths or arbitrary free text and assume field redaction will find them. Limit access to all log stores/exports/backups: IPs, URLs, user agents and stack traces can contain sensitive data.

## Environment and persistent storage

These are **plain environment variables**, without a `NUXT_` prefix:

| Variable | Values | Default |
|---|---|---|
| `LOG_CONSOLE` | `off`, `errors`, `all` | `errors` |
| `LOG_FORMAT` | `json`, `pretty` | `json` in production; `pretty` otherwise |
| `ACCESS_LOG_DIR` | Writable persistent directory | `storage/logs/access`, resolved from process cwd |

- `errors`: errors/warnings to stderr. `all`: also access/activity and app info/debug to stdout; info/debug still respect log-level/debug settings.
- The saved admin **Console output** toggle upgrades `errors` to `all` live. It cannot override the operator's `off`.
- Invalid console/format values fall back to defaults with a warning. Console configuration is cached at process startup; recreate the container for env-file changes. These controls do not silence unrelated Nitro/`console.*` output.
- JSON entries are one line, including escaped stack newlines, capped at **16 KiB including the newline**. Oversized stacks/context may be truncated. Causes are bounded to three stack-free levels.

The image runs in `/app`; default logs are **`/app/storage/logs/access`**. Production Compose mounts `./app-storage:/app/storage`, relative to `deploy/production/docker-compose.yml`. The normal **host** path is therefore **`deploy/production/app-storage/logs/access`**. Inspect the actual mount, not a similarly named repository directory. Match the app UID:GID (Compose defaults to `1000:1000`) to writable host ownership.

An `ACCESS_LOG_DIR` override should be an absolute **container** path on a verified persistent mount. An unmounted path or `/tmp` loses history on recreation. Keep the same absolute directory during migration/restarts/recovery. The writer/migration assume **one app writer**; do not share a directory between overlapping old/new instances.

```bash
# From the project root; preserve existing secrets in the real env file.
docker compose --env-file deploy/production/.env -f deploy/production/docker-compose.yml config --quiet
docker compose --env-file deploy/production/.env -f deploy/production/docker-compose.yml up -d --force-recreate app
docker inspect --format '{{json .Mounts}}' pandablog-app
docker exec pandablog-app panda info
docker exec pandablog-app panda health --timeout 4
```

Recreation is a deployment action: first follow the backup/migration approvals below. A healthy process is **not** proof that migrations or retention completed. `GET /api/health` is lightweight liveness; `?db=1` adds a bounded connectivity probe, not schema/restore readiness.

## Reading container logs

The following Linux-host commands require `jq`, `LOG_FORMAT=json`, and the Compose container name `pandablog-app`. For a direct `docker run` deployment, use its actual container name instead.

```bash
# Merge stdout/stderr; other startup diagnostics may not be JSON.
docker logs --since 15m pandablog-app 2>&1 | grep '"kind":"error_log"' | jq .

# Safely discard non-JSON diagnostics, then filter by severity.
docker logs --since 1h pandablog-app 2>&1 \
  | jq -R 'fromjson? | select(.level == "error" or .level == "warn")'

# Copy the request ID from the error detail UI or response X-Request-Id.
docker logs --since 1h pandablog-app 2>&1 | grep -F -- '<actual-request-id>'

# Structured exact match (works for error/access/activity entries).
docker logs --since 1h pandablog-app 2>&1 \
  | jq -R --arg id '<actual-request-id>' 'fromjson? | select(.request_id == $id)'
```

Do **not** add `docker logs --timestamps` before JSON parsing: it prepends text. JSON `ts` already supplies the UTC time. With default `errors` mode, request correlation may find only an error, not the matching access/activity console entry; use access files for those. Rotation or recreation may already have removed the relevant console history. Error entries include the 16-hex `fingerprint` for group correlation.

### Docker rotation

Production Compose uses `json-file`, `max-size: "10m"`, `max-file: "5"`: roughly **50 MB per app container**. This controls Docker stdout/stderr history only, **not** access files or DB storage. Oldest history is discarded; it is not a durable backup.

```bash
docker inspect --format '{{json .HostConfig.LogConfig}}' pandablog-app
# Expect: json-file with max-size "10m" and max-file "5".
```

Recreate, rather than restart, after changing driver/options/env values. Preserve needed old Docker history first. Test actual rotation on a disposable container, not by flooding production. Do not modify Docker's own log files directly.

## Access file layout and manual inspection

```text
/app/storage/logs/access/
  access-2026-05-20.ndjson       # Current UTC day, append-only
  access-2026-05-19.ndjson.gz    # Closed past days
  .index.json                  # Disposable stats cache
  .migration-v1.json           # Migration safety receipt; NOT the stats cache
```

Compact keys: `ts` timestamp, `id` request ID, `m` method, `p` path, `s` status, `d` duration in ms; optional `ip`, `ua`, `ref`, `q` are IP, user agent, referrer and redacted/trimmed query parameters. Admin rows expand these keys and use **`YYYY-MM-DD:<request_id>`** detail IDs. Old DB IDs without a date prefix return 404.

Read-only host examples (substitute actual mount and UTC date):

```bash
LOG_DIR='deploy/production/app-storage/logs/access'
jq -c 'select(.s >= 500) | {ts,id,m,p,s,d}' "$LOG_DIR/access-2026-05-20.ndjson"
zcat "$LOG_DIR/access-2026-05-19.ndjson.gz" | jq -c 'select(.s >= 500)'
zcat "$LOG_DIR/access-2026-05-19.ndjson.gz" \
  | jq -c --arg id '<actual-request-id>' 'select(.id == $id)'
sudo du -sh "$LOG_DIR"
```

The active file can end in a partial in-flight line during inspection. Prefer admin reads or closed gzip files for complete scans. Unknown files and symlinks are not followed/deleted. A plain and gzip version may coexist during compression recovery; the reader prefers plain to avoid double counts. Never manually delete/edit/truncate active files or migration sources/receipts.

The Access tab defaults to the last **24 hours**, with UTC pickers bounded by saved retention. Narrow date ranges if the reader reports truncation: it has 2M-line/3-second scan guards and a 200K-match per-file bound. `N+` is a scanned lower bound (even `0+`), not an exact total; Last page is disabled. CSV/JSON access exports cap at **10K rows** and signal scan truncation with `X-Log-Truncated` (JSON also has `truncated`). Stats count physical lines, not necessarily valid parsed records; bounds are UTC day starts from filenames. Actual file bytes are separate from the dashboard's **estimated** DB bytes.

## Retention and manual controls

Saved defaults: **access 30 days**, **activity 365 days**, **errors 90 days**, **50 occurrences per error group** (configurable 1–500).

| Trigger | Timing / behavior |
|---|---|
| Deferred boot pass | Five minutes after startup; may delete historical backlog |
| Daily retention | `17 3 * * *`: 03:17 server time (UTC in the image) |
| Access compression pass | `5 0 * * *`: 00:05 **UTC**, using the same full retention runner |
| **Run now** | Logs → Settings → Retention; uses **saved**, not unsaved form values |

All triggers share one single-flight run in an app process. The 00:05 pass also trims enabled DB streams. Access maintenance gzips past UTC days, keeps today's file writable, and removes day files **strictly before** `today UTC - retention_access_days`; the cutoff day is kept whole. Activity/error age cleanup uses timestamp cutoffs. Expired error groups are removed with their samples, and remaining groups' samples are capped to the newest N. Group lifetime `count` does not decrease when samples are trimmed.

The settings page shows the in-memory last report; it resets after restart. Superadmin endpoints:

- `GET /api/admin/logs/retention`: last report and daily cron expression (the expression does not list the separate UTC compression/boot triggers).
- `POST /api/admin/logs/retention/run`: runs retention and returns its report.

Inspect **`errors[]`**, not just a success toast. Reports use `deleted.activity`/`errors`/`error_groups` for rows/groups, **`deleted.access_files` for physical files**; legacy `deleted.access` stays zero. One stream's failure does not stop the others. Deletion/failure runs record `system.log_retention` when activity logging permits it; successful audits are console-visible only in effective `all`. A no-op or compression-only pass may have no audit/console entry.

Manual cleanup is distinct from Run now: access supports age/whole-day cleanup only (no keep-latest); activity/error occurrence cleanup supports age or keep-latest. Use Run now for paired group expiry/sample caps. Confirmed access purge removes all recognized day files, drains/closes descriptors and truncates the formerly active file; its result counts **lines**, unlike age cleanup's **files**. These are destructive controls: approve/back up first, never purge during pending migration.

## Error inbox and storm behavior

Read/resolve state belongs to **groups**, not occurrences. A new recurrence makes a read group unread; recurrence after resolution also sets **regressed**. Group details show the latest stack/status and up to 50 recent retained occurrences. The daily timeline is a **sample**, not lifetime traffic. CSV exports occurrences, not the inbox's group status/order filters.

Per fingerprint, the first 20 occurrences in a 10-second window are sampled to the DB; excess errors increment a trailing aggregate flushed about once per second. Console errors still emit independently. Sample caps apply during retention, so temporary overflow is normal. In-memory pending counts can be lost on process crash/DB outage; group counts are best-effort, not accounting guarantees. Full backups should preserve groups **and** occurrences consistently.

## Backups, first upgrade and rollback

Normal full/incremental backups include remaining **DB tables** (including activity, errors and groups) plus the media archive. Partial backups honor their explicit table selection. **Access day files, legacy buffers and Docker console history are not included in the DB/media backup.** The retired `include_access_logs` setting/UI is gone; legacy saved values are ignored and omitted on the next settings save. Historical manifest `excluded_tables` remains supported. During an unfinished migration, full DB exports can still include the legacy table because it has not yet been removed.

Arrange a separate, verified backup/restore policy for the persistent access directory if that history matters. Quiesce the writer or use a consistent filesystem snapshot rather than copying a changing file and assuming it is complete. Keep DB/media/log snapshots from the same approved cutover window. Verify backup jobs actually complete; the pre-existing empty-media archive limitation can fail with `no paths specified to add to archive`.

**Before the first final-image startup**, rehearse the [Phase 2/3 rollout checklists](./progress.md#phase-2-verification-and-deployment-checklist-log-28) on an approved production DB copy:

1. Back up DB, media, log directory and legacy `storage/logs` buffers separately. Approve saved retention (rows outside the migration cutoff will be discarded), check disk headroom, stop all old writers, and verify one persistent writable mount. Automatic retention starts five minutes after boot.
2. First startup defers a checkpointed export of retained `access_logs`/known legacy buffers; it does **not** remove the table. Require `__access_logs_exported_v1` and a matching durable `.migration-v1.json` receipt. Compare request IDs/counts/redaction and representative API reads, not just health or a matching total. Keep logs/access modules enabled and do not purge/edit/change retention or paths.
3. Promptly restart the same image with the **same absolute directory** after verified export, before retention can expire a receipt day. ROOT verifies the receipt and minimum physical counts, removes the table and sets `__access_logs_table_removed_v1`. Require absence of `access_logs` in `INFO FOR DB`.
4. Error backfill is deferred and restart-safe; require `__error_groups_backfill_v1`, no remaining unassigned occurrences, and record the actual group N. Do not independently reset groups/fingerprints/markers to rerun it.

Read-only checks in the explicitly selected namespace/database:

```sql
INFO FOR DB;
SELECT * FROM app_settings WHERE key INSIDE [
  '__access_logs_to_files_v1', '__access_logs_exported_v1',
  '__access_logs_table_removed_v1', '__error_groups_backfill_v1'
];
SELECT count() AS n FROM error_logs WHERE fingerprint = NONE GROUP ALL;
SELECT count() AS n FROM error_groups GROUP ALL;
SELECT count() AS n FROM error_groups WHERE read_at = NONE AND resolved_at = NONE GROUP ALL;
```

Missing/moved/truncated mounts or mismatched receipts fail closed. Restore the verified files/mount or obtain reviewed recovery instructions; **do not bypass checks by deleting markers/receipts**. Unlike `.index.json`, preserve `.migration-v1.json` through successful removal. Restoring an old DB backup containing `access_logs` triggers a fresh deduplicating export and another verified second startup. Schema reapplication alone does not migrate it.

Rollback is not just changing the image tag: the old app expects the removed table/buffer and cannot read new day files. Stop the new writer, restore the approved consistent pre-cutover DB/media/log snapshot, and review preservation/reconciliation of post-cutover traffic. Never overlap old/new writers.

## Troubleshooting

| Symptom / diagnostic | Check and recovery |
|---|---|
| DB down; error inbox empty/stale | Errors still go to **stderr** (`docker logs` merges stdout/stderr) in effective errors/all, even with DB storage disabled. Check DB reachability/auth and hook threshold/module flags. `off` intentionally silences this sink. |
| `[logging] DB write failed; disabling DB writes for 60s` | Shared error/activity DB circuit breaker. Fix DB/auth/timeout failures; writes are attempted again after the cooldown on subsequent events. Skipped writes are not replayed. Access files and console are independent. |
| `access log file write failed; entries may be lost` | Check the actual mount, UID:GID, permissions and disk space. The first failure retries on the next append; repeated failures back off 60s. Warnings are rate-limited. Logging must not break requests; lost entries are not recoverable from this writer. |
| `access log file queue full; dropping entries` | The bounded write/replay queue has an 8 MiB guard. Check disk throughput/free space and competing work; `ctx.dropped` reports drops since the previous warning, at most once per minute. Consider sampling after review, not disabling observability blindly. |
| `retention completed with errors` | Inspect the last report's per-stream errors and saved settings/module gates. Fix I/O/DB failures, then use approved Run now. Check both cron schedules, boot pass and host timezone; reports reset on restart. |
| No successful-run console line | Normal in errors mode, no-op/compression-only runs or disabled activity logging. Query the last report; console silence is not evidence of completion. |
| Migration/backfill warning or boot failure | Inspect markers, same-directory receipt and retained sources. Follow the checklists; health is liveness only. Retry after fixing the cause without clearing safety state. |
| Stats stale/cache damaged | `.index.json` is disposable and rebuilt opportunistically. Coordinate removal of that cache only; never confuse it with the migration receipt. File I/O/corrupt gzip errors are real failures, not cache misses. |
| Access search returns few/no rows with `N+` | Narrow dates/filters and retry; scan lower bounds do not prove absent traffic. Also check UTC dates, sampling/exclusions and directory ownership. |
| DB disk size does not shrink after deletion | Compaction may delay reclamation. Compare the actual persistent DB directory with the same units/tool, not the dashboard estimate. Do not delete/compact DB files without the DB's reviewed procedure. |

After deployment, record timestamped actual DB bytes, access-file bytes/lines, backup sizes, error group N, Docker output and 24-hour/overnight observations in [progress.md](./progress.md). Baseline was **635,189 access rows**, **1,409 error rows**, **210 MB DB disk**, and **32.9 MB DB + 1.9 MB media backup**. Local synthetic fixture results are documented separately; **production post-redesign measurements remain pending**.
