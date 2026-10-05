# Spec 01: Console output and error capture

Tasks: **LOG-1.1**, **LOG-1.2**, **LOG-1.8**

## 1. Goal

`docker logs pandablog-app` shows every server error (5xx) with its stack trace and request id, one JSON object per line, without needing the DB or the admin UI. Access and activity entries appear only when the operator asks for them.

## 2. Env configuration (LOG-1.1)

| Var | Values | Default |
|---|---|---|
| `LOG_CONSOLE` | `off`, `errors`, `all` | `errors` |
| `LOG_FORMAT` | `json`, `pretty` | `json` when `NODE_ENV=production`, otherwise `pretty` |

- Read once at module load from `process.env`. Invalid values fall back to the default and print a one-time `console.warn('[logging] invalid LOG_CONSOLE=…')`.
- Export `resolveConsoleConfig(env: NodeJS.ProcessEnv)` as a **pure** function (unit tested), and a cached `getConsoleConfig()`.

## 3. Effective mode

```
effectiveMode =
  env === 'off'                         → 'off'      (operator hard-off; DB cannot override)
  env === 'all'                         → 'all'
  env === 'errors' && db.console_output → 'all'      (admin UI toggle upgrades)
  env === 'errors'                      → 'errors'
```

What each mode emits:

| Entry kind | `off` | `errors` | `all` |
|---|---|---|---|
| `error_log` (logError) | – | ✔ stderr | ✔ stderr |
| `warn` helper | – | ✔ stderr | ✔ stderr |
| `info` / `debug` helpers | – | – | ✔ (still gated by `log_level` / debug flags) |
| `access_log` | – | – | ✔ stdout |
| `activity_log` | – | – | ✔ stdout |

Console output does **not** depend on `settings.enabled` / `error_log_enabled`. Those control *storage*. Exception: `LOG_CONSOLE=off` silences everything.

Update the `console_output` UI description (en + zh-CN) to: *"Also print access and activity logs to the container console (docker logs). Errors are printed according to the LOG_CONSOLE environment variable."*

## 4. Line format

### `json` (production)

One line per entry, written with `process.stdout.write(line + '\n')` (info/access/activity) or `process.stderr.write` (warn/error). Do **not** use `console.*`, because it can split multi-line values.

Common envelope (keys in this order, `null`/`undefined` omitted):

```json
{"ts":"2026-05-20T10:12:03.123Z","level":"error","kind":"error_log","msg":"Cannot read properties of undefined (reading 'id')","request_id":"6f0c…","method":"POST","path":"/api/admin/posts","status":500,"fingerprint":"a1b2c3d4e5f6","err":{"name":"TypeError","message":"…","stack":"TypeError: …\n    at …","cause":{"name":"…","message":"…"}},"ctx":{"source":"nitro.error_hook"}}
```

| Key | Description |
|---|---|
| `ts` | ISO-8601 UTC |
| `level` | `debug` \| `info` \| `warn` \| `error` |
| `kind` | `error_log` \| `access_log` \| `activity_log` \| `app` (for `debug/info/warn/error` helpers) |
| `msg` | Human message (error message, `"GET /path 200"`, activity description/action, helper message) |
| `request_id`, `method`, `path`, `status`, `duration_ms`, `ip`, `ua` | When available |
| `err` | `{ name, message, stack, cause? }` for errors. Stack is kept as one string with `\n`, so the line stays a single line once JSON-encoded. |
| `fingerprint` | Added in Phase 3 (LOG-3.3). Omit until then. |
| `ctx` | Remaining redacted context / metadata (via `redactDeep` + `trimByMaxSize`) |

Rules:
- Serialization must never throw. Use a safe stringify (handle circular refs, BigInt, record-id objects) and fall back to `{"ts":…,"level":"error","kind":"app","msg":"[logging] unserializable entry"}`.
- Hard cap of **16 KB per line**. If exceeded, truncate `err.stack` first, then `ctx` (replace with `{"_truncated":true}`).
- `cause` chain: follow `error.cause` up to 3 levels; each level is `{ name, message }` (no stack).

### `pretty` (dev)

`HH:MM:SS.mmm LEVEL kind msg (request_id) [method path status]`, followed by the indented stack for errors. Colors are optional. Not unit-tested beyond "does not throw".

## 5. Error capture changes (LOG-1.2)

File: `server/plugins/logging-error-hook.ts`, `server/utils/logging.ts`

1. Extract status: `status = error.statusCode ?? error.status ?? event?.node.res.statusCode ?? 500`. Put it in the payload as `status_code` and in the console line as `status`.
2. **Filter:** if the error comes from the Nitro hook and `status < settings.error_log_min_status` (default 500), skip it completely (no DB, no console). Explicit `logError()` calls from application code are **not** filtered.
3. Add a schema field: `DEFINE FIELD IF NOT EXISTS status_code ON error_logs TYPE option<int>;`
4. Add a `cause` chain to the stored payload under `context.cause` (same shape as §4).
5. Mark `unhandled` / `fatal` flags from H3 errors in `context` (`{ unhandled: true }`), so the UI can distinguish crashes from intentional `createError(500)`.
6. Pure helper in `logging-logic.ts`: `shouldCaptureHookError(status: number, minStatus: number): boolean` (unit tested).

New setting `error_log_min_status` (int 400–599, default 500). Follow the checklist in spec 00 §5. UI: number input in the settings page, "Errors" section, hint *"Errors with a lower HTTP status (e.g. 401, 404) are ignored."*

## 6. Interaction with existing `console.warn/error` calls

The ~48 scattered `console.*` calls in `server/` stay as they are (out of scope). Convert only the calls inside the logging subsystem (`logging.ts`, `logging-access-buffer.ts`) to the sink, using `kind: "app"`.

## 7. Deployment (LOG-1.8)

`deploy/production/docker-compose.yml`, `app` service:

```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
```

Add `LOG_CONSOLE=errors` (with a comment listing the values) to the production `.env` example, or to the README deployment section if no example exists. Document these in `docs/logging/operations.md` (LOG-4.2):

```bash
docker logs pandablog-app 2>&1 | grep '"kind":"error_log"' | jq .
docker logs pandablog-app 2>&1 | grep <request-id>
```

## 8. Tests

`tests/unit/log-console.test.ts`:
- `resolveConsoleConfig`: defaults, valid values, invalid values, production vs dev format.
- Effective mode matrix (§3), all 6 combinations.
- `formatJsonLine`: single line (no raw `\n`), key order, null omission, redaction applied, 16 KB cap, circular object safe, cause chain depth limit.
- `shouldCaptureHookError` boundaries (399/400/499/500).

## 9. Acceptance criteria

- [ ] With default env, throwing inside any API handler prints exactly one JSON line to stderr containing `stack` and `request_id`.
- [ ] A 404 page / 401 API call prints nothing and stores nothing in `error_logs`.
- [ ] `LOG_CONSOLE=off` → nothing printed by the logging subsystem.
- [ ] `LOG_CONSOLE=all` → each request prints one `access_log` line.
- [ ] The admin toggle `console_output` upgrades `errors` → `all` without a restart.
