# Access-log retirement: operator cutover runbook

**Working-tree implementation; not deployment-approved.** Current logging behavior is described in [logging operations](../logging/operations.md). This runbook does not authorize deleting receipts, editing a configured DB, archival or deployment. Require the local [acceptance matrix](./acceptance-test.md) and separate operator authorization before cutover. See [progress.md](./progress.md) for evidence/gaps.

## 1. Target ownership

| Data | New writes | Read/retention owner |
|---|---|---|
| New HTTP access logs | Existing reverse proxy | Proxy/host operator; no PandaBlog API/UI |
| Existing app access files/buffers/receipts | None from the target app | Independent protected archive; no target-app scans/expiry |
| Surviving `access_logs` and migration markers | None from the target app | Cold DB/snapshot history; no automatic migration/removal |
| Errors/groups and activity | Existing app console/DB behavior | Existing Logs UI and remaining DB retention |
| Analytics/post counts | Existing behavior | Existing analytics system; unaffected |

No replacement Access page, request chart or access export/purge/cleanup exists. `LOG_CONSOLE=all` no longer emits per-request access entries. `ACCESS_LOG_DIR`, access exclusions/sampling/retention settings and the active Access module switch are retired; legacy saved/manifest input does not reactivate them.

## 2. Pre-cutover checklist (separate operator authorization required)

1. Confirm implementation/compatibility approval and exact reviewed image. Require actual request-ID, proxy privacy/rotation, full-backup preservation and remaining-log/module acceptance; do not infer from container health.
2. Identify the **actual** app storage mount, any absolute/container `ACCESS_LOG_DIR` override, fixed legacy `storage/logs` buffer location, DB namespace/database, and existing Docker/proxy history. Do not inspect the user's `.env` through an unapproved fixture.
3. Inventory all existing access artifacts, including unknown/temporary files, symlinks and migration receipts. Inspect DB table/markers read-only under appropriate authorization. An unfinished migration means preserve every source and destination, not resume it with an arbitrary cutoff.
4. Establish edge JSON logging, privacy fields, app response-ID correlation, persistence and rotation **before** retiring the app writer. Use the real operator-supplied proxy config/version and approved traffic; do not start a second production app.
5. Approve retention/access control for new proxy logs and cold archives separately. Existing app retention does not expire cold archives; no automatic space reclamation follows retirement.
6. Arrange unrestricted consistent DB/media rollback snapshots and separate access-directory/buffer archives. App DB/media bundles do not contain file logs, and historical backups may already exclude the old access table. Preserve needed Docker history before recreation.
7. Stop/quiesce the old app writer before the final history snapshot; pause/co-ordinate other authorized writers as required for consistency. A changing file copied while the old app runs is not a verified complete archive. Old boot/retention can mutate history, so do not repeatedly start it during archival.
8. Verify complete archive inventory/bytes/checksums and a restore of the copy. Capture all legacy DB rows, not only the configured retention window. The old Access API export is capped and is not an archival mechanism. Keep free space for archives and normal backup/restore headroom.

Archival tooling is operator-owned and bounded/streamed. Do not follow symlinks into unrelated data, put archives in public/static directories, delete source remnants, or create a new app archive/migration service for this runbook.

## 3. Cutover sequence

1. After the verified quiesced snapshots and edge logging are ready, keep the old app stopped and replace it with the reviewed target image. No rolling overlap or shared old/new access writer.
2. Keep historical mounts/files/DB rows/markers intact. Target startup must not require their readability, scan them, or migrate/drop them. Do not remove `.migration-v1.json` merely because the code was retired.
3. Verify readiness, published pages/private-site behavior, authorized admin activity and a controlled error in an approved environment. Check that client response, proxy entry and applicable application error/activity contain the same app request ID.
4. Check remaining Logs overview/errors/activity/settings and analytics/post view counting. No Access navigation, hourly calls, file bytes, access cleanup or per-request app console entries should remain.
5. Verify access artifact hashes/DB source rows unchanged using approved read-only checks. Review proxy output for unexpected headers/query/referrer secrets; stop rollout if privacy/correlation differs from the accepted contract.
6. Record image/config versions, UTC cutover boundary, proxy location/rotation, archive inventory, backup identifiers, downtime, test results and gaps. A healthy response is not archive/retention evidence.

The edge may record redirects, denials and downtime errors that the old app did not. A short overlap in **log coverage** while validating the edge is acceptable and must be documented; overlapping application writers are not.

## 4. Reading target logs

- Application errors/activity: continue using Docker console and existing error/activity UI per [logging operations](../logging/operations.md), with app-owned access instructions retired.
- New access traffic: inspect the proxy's protected JSON files/console using its actual mount/path. Match the **application response** `X-Request-Id` field to error/activity `request_id`, not an unrelated edge-generated ID.
- Caddy already supplies a rotating per-app log snippet. The implementation must verify its filtered format and correlation. Ten MiB/five-file/720-hour settings are capacity ceilings, not a guaranteed 30-day history.
- nginx needs the reviewed `http`-context JSON format, site output path and operator-managed logrotate/reopen policy. An inherited unknown global access log is not verified per-site coverage.
- Edge-only requests/502s/504s may lack an app request ID. Look at time/path/status and the separate edge ID if available; do not diagnose every missing app ID as a PandaBlog failure.
- Cold history: read an approved **copy**, outside the app. Historical NDJSON uses `ts,id,m,p,s,d` and optional `ip,ua,ref,q`; `.gz` is compressed. Preserve malformed/unfinished artifacts as evidence; parsing failures do not authorize discarding them.

All stores can contain personal/sensitive data. Default new edge output excludes query strings, credentials, cookies, bodies and referrers, but path segments may still be sensitive. Apply restrictive permissions and a deliberate privacy/retention policy.

## 5. Backup/restore and downgrade

Implemented compatibility, exercised by the guarded real DB full-worker/rollback fixtures (see progress): otherwise-supported full snapshots containing `access_logs` restore that table as inert data. Verification, current schema/runtime repair, sessions/cache/analytics repair, safety snapshot and paired rollback remain mandatory. There is no access re-export, receipt repair or table deletion after restore/restart. Unsupported non-full/unknown snapshots stay unsupported.

The access-specific full-restore refusal has been removed, not general snapshot validation. Do not strip a legacy table or bypass validation to obtain a restore success. Separate file-log archives never become part of the DB/media bundle by implication; production-copy verification remains required.

Downgrade requires its own approval:

- Stop the target app. Preserve new DB/media changes and proxy history before any snapshot replacement.
- Choose an old release and compatible consistent DB/media/log snapshot; verify its settings, migration markers and receipts together on an isolated copy first.
- An old release can resume access migration/retention and discard older source history. Returning to it is not a harmless image-tag change.
- Do not import proxy entries into app files, reset markers, truncate receipts, merge unfinished migrations or replay new traffic automatically. Reconciliation belongs to a separate reviewed recovery procedure.

## 6. Failure checks

| Symptom | Check |
|---|---|
| No new access log | Real proxy site config, mount/permissions, format/filter, rotation and whether request reached that edge; app access settings are intentionally irrelevant |
| App request ID absent/mismatched | Edge-only response versus actual app response; proxy extraction; cached stale headers; outer maintenance path ordering; accepted health exception |
| Retired access URL returns data or deletes history | Stop release: a static/generic route or old image still executes access code |
| Archive grows/changes under target app | Stop release: unintended access writer/migration/retention or an external old writer; preserve evidence, do not purge |
| Disk stays occupied by old access history | Expected: retirement preserves history and does not reclaim space; authorized archive expiry is a separate operation |
| Legacy full restore refuses | Check approved compatibility status and D4/D5 evidence; no validation bypass or table stripping |
| Errors/activity/analytics stop working | Regression outside intended scope; inspect modules/settings/readiness and roll back through the approved procedure |

Production-copy, real mount/rotation, post-cutover and overnight observations are external operator gates. No operation on the user's deployment or history is authorized by implementation/local testing.
