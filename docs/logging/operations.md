# Logging operations

Application-owned HTTP access logging has been retired. See the [retirement plan](../access-log-simplification/plan.md), [evidence ledger](../access-log-simplification/progress.md) and [cutover/archive runbook](../access-log-simplification/operations.md). Local verification is not approval to deploy, archive user data or remove historical files/tables/receipts. Unrelated [backend release gates](../backend-hardening/release-handoff.md) remain applicable.

## Where logs live

| Stream | New writes | Reading / retention |
|---|---|---|
| HTTP access | Existing Caddy/nginx edge only | Proxy/host operator, outside the app |
| Errors | `error_groups` and retained `error_logs` samples | Logs → Errors; console stderr; existing DB retention |
| Activity | `activity_logs` | Logs → Activity; optional console stdout; existing DB retention |
| Application diagnostics | Structured console | Docker/container console |
| Old app access files/buffers/receipts/DB rows | None from the target app | Cold history; independent protected archives; no automatic expiry/conversion/drop |

There is no Access page, request chart, file-storage estimate, access query/detail/export/purge/cleanup API or per-request app console sink. Logs overview shows estimated **DB log storage**, activity counts and unread error groups. Authenticated retired access routes are 404 (including generic detail/export/purge fallbacks); cleanup `type: 'access'` is a validation 400.

Error/activity storage switches and the existing error module gates retain their meanings. DB storage switches do not silence eligible console output; disabling a module can disable its capture entirely. Automatic Nitro error capture defaults to status **500**; explicit application `logError()` calls bypass that threshold. Structured console output retains field-name redaction, cause chains and size limits. Secrets in free text/path segments are not automatically redacted.

## Console configuration

Plain process variables, without `NUXT_` prefix:

| Variable | Values / default |
|---|---|
| `LOG_CONSOLE` | `off`, `errors`, `all`; default `errors` |
| `LOG_FORMAT` | `json`, `pretty`; production defaults to `json`, otherwise `pretty` |

`errors` emits warnings/errors to stderr. `all` also emits existing activity/app info/debug entries to stdout; app info/debug still respect their level/debug controls. The saved admin `console_output` toggle upgrades `errors` to `all` live, not `off`. There are **no access entries even in `all`**. Configuration is cached at startup; recreate after process-env changes. These settings do not silence unrelated `console.*`/Nitro diagnostics.

JSON entries are one physical line, capped at 16 KiB including newline; stack/context may be truncated. Causes are bounded to three stack-free levels. Invalid config values warn and fall back.

Production Compose's `json-file` driver uses `max-size: "10m"`, `max-file: "5"`, about 50 MB per app container. Docker rotation/recreation can discard history; console output is not a durable archive. This driver does not rotate proxy logs or DB records.

Read-only examples (substitute the actual container name; host `jq` required):

```bash
docker logs --since 15m pandablog-app 2>&1 \
  | jq -R 'fromjson? | select(.kind == "error_log")'
docker logs --since 1h pandablog-app 2>&1 \
  | jq -R --arg id '<actual-request-id>' 'fromjson? | select(.request_id == $id)'
docker inspect --format '{{json .HostConfig.LogConfig}}' pandablog-app
```

Do not use Docker's timestamp prefix before JSON parsing. Preserve needed console history before replacing a container; never edit Docker's own log files.

## Request correlation

The app generates a fresh server-owned UUID in `event.context.requestId` and response `X-Request-Id`, independently of logging settings/module flags or DB readiness. Incoming request-ID headers are ignored for application identity. The outer maintenance handler covers fenced requests; the response hook reapplies the current ID after cached headers, without adding cache-key variation.

Exact `/api/health` and `/api/health/` probes remain ID-free. Other paths formerly excluded from access logs can now carry an ID. IDs identify actual HTTP requests, not browser pageviews or a distributed trace. Internal subrequests may have their own ID. Shared external caches and edge-only responses may not reach the app at all.

Match the proxy's **application response ID** (`app_request_id`) to error/activity `request_id`. An edge-generated ID is a separate identifier. Redirects, edge denials or unavailable-upstream 502/504 responses can have no app ID; do not invent one or trust a client-supplied value.

## Reverse-proxy access logs

The supplied configurations default to timestamp, method, path without query, status, duration in **seconds**, client IP and application response ID. They omit bodies, auth/cookie headers, response cookies, referrer and UA. Sensitive path segments and client IP remain sensitive; restrict access and approve retention. Do not enable debug/header logging and assume the access encoder protects other diagnostic sinks.

### Caddy

`deploy/production/caddy/Caddyfile` supplies a Caddy 2.10+ filtered JSON snippet. `conf.d/panda.caddy` imports it. Request headers and response headers are removed; URI queries are stripped; `log_append` captures the application response `X-Request-Id` as a separate field.

Keep `/var/log/caddy` on a verified persistent **proxy-owned** mount. The example has 10 MiB active-file rotation, five rolled files and a 720-hour age ceiling. Size/count limits can shorten history; this does not guarantee 30 days. Validate your actual Caddy version and site before operator-authorized reload/recreation. Do not mount logs into PandaBlog.

### nginx

Install `deploy/production/nginx/access-log-format.conf` in `http {}` **before** the vhost (for example, as `00-pandablog-log-format.conf`). The supplied `pandablog.conf` explicitly writes its HTTP/HTTPS servers to `/var/log/nginx/pandablog.access.log` using that JSON format. Run the proxy in UTC if UTC-formatted timestamps are required; `$time_iso8601` otherwise carries its timezone offset.

`$uri` excludes query strings and is normalized; `$upstream_http_x_request_id` is the app response ID. `$request_id` is recorded separately as `edge_request_id`. Missing upstream values can be `-`, not an application ID.

Persist the log path and configure host/proxy rotation plus reopening. `pandablog.logrotate.example` is **not automatically installed**: adapt users, paths and reopen command to the actual host/container. Rotation only occurs when the operator's logrotate service runs; five rolled files/max age/size are ceilings, not guaranteed history. Validate nginx's actual complete configuration before authorized reload.

Both edges retain trusted client-IP header handling. App exclusions, status filters, sampling and the old 30-day access retention are not transferred to the proxy. The examples log health/static/edge-generated traffic too; approve deliberate exclusions at the edge. Counts and request durations need not match the retired chart. Direct local app runs work without access logging.

## Remaining DB retention and error inbox

Defaults remain activity 365 days, errors 90 days, 50 occurrences per error group (1–500 configurable). The existing shared runner executes five minutes after boot, daily at `17 3 * * *` server time and on approved admin Run now. The old 00:05 UTC access-compression invocation is removed.

`GET /api/admin/logs/retention` returns the in-memory last report and daily schedule; `POST /api/admin/logs/retention/run` uses saved settings. Inspect `errors[]`, not just the toast. New reports contain `deleted.activity`, `errors`, optional `error_groups`—no access/file counts. Old audit metadata is historical and unchanged. Manual age/keep-latest cleanup and confirmed purge apply only to activity/errors; existing authorization and confirmations remain.

Read/resolve state belongs to error groups. Recurrence reopens read groups; recurrence after resolution marks regression. Recent samples/timeline are not lifetime traffic. First 20 same-fingerprint occurrences per 10 seconds are sampled; suppressed counts flush about once per second. Console remains independent. Counts are best-effort across process death/DB outages, not accounting guarantees. Sample caps and expired groups are trimmed by the remaining runner.

## Historical access data, backups and downgrade

The target app never opens, counts, compresses, truncates, purges, migrates or drops access history. `ACCESS_LOG_DIR` is ignored. Old persisted access keys and migration markers remain untouched during startup; remaining settings normalize in memory. Ordinary save/reset omits retired keys; new settings PUTs with retired/unknown keys reject before writes. Old manifests with boolean `logs.accessLogs` are accepted as no-op input; new output/configurator omits it.

Preserve all existing access day files, `.index.json`, `.migration-v1.json`, gzip/plain duplicates, `.migrating`/`.gz.tmp` leftovers, fixed legacy buffers/`.flushing` sources and unknown artifacts. Missing or damaged old mounts/receipts no longer block startup because they are not inspected. **No disk reclamation happens automatically.** Archive expiry/removal needs separate operator authorization.

The [full backup bundle](../backup-simplification/operations.md) captures DB tables and media originals, not access files/buffers, proxy/Docker logs or configuration/keys. A surviving `access_logs` table is included as inert DB history. Supported full restore preserves it via normal all-table staging/validation/import and paired rollback; neither restore nor later boot resumes access migration or drops it. Unsupported non-full/unknown formats remain unsupported. Never exclude/drop legacy rows to make restore pass.

Before a separately approved cutover, stop/quiesce the old writer, preserve consistent DB/media and **separate** access-file/buffer snapshots, verify complete inventories/checksums and rehearse restoration of a copy. The old migration exported only its retention subset; old API exports were capped at 10K rows. Neither is a complete archive strategy. Do not start the old image repeatedly or delete receipts during archival: its migration/retention can still mutate history.

Downgrade is not just an image-tag switch: retain post-cutover DB/media/proxy history and rehearse an old release with compatible DB/media/logs/markers/receipts on an isolated copy. No automatic proxy-log replay, marker reset or unfinished-migration merge is supplied. See the [cutover runbook](../access-log-simplification/operations.md); deployment/production-copy/overnight acceptance remains separate.
