# Spec 03: Reduce access-log volume at the source

Tasks: **LOG-0.1**, **LOG-1.5**, **LOG-1.6**

## 1. Goal

Stop recording requests that carry no operational value, most importantly the Docker healthcheck, and stop the healthcheck from rendering the homepage every 30 s.

## 2. Baseline measurement (LOG-0.1, operator task, no code)

Run these in the SurrealDB shell (or Surrealist) against the production DB, then paste the results into `progress.md` under "Baseline":

```sql
SELECT count() AS n FROM access_logs GROUP ALL;
SELECT math::min(timestamp) AS oldest, math::max(timestamp) AS newest FROM access_logs GROUP ALL;
SELECT ip, count() AS n FROM access_logs GROUP BY ip ORDER BY n DESC LIMIT 10;
SELECT path, count() AS n FROM access_logs GROUP BY path ORDER BY n DESC LIMIT 20;
SELECT user_agent, count() AS n FROM access_logs GROUP BY user_agent ORDER BY n DESC LIMIT 10;
SELECT status_code, count() AS n FROM access_logs GROUP BY status_code ORDER BY n DESC;
SELECT count() AS n FROM error_logs WHERE context.source = 'nitro.error_hook' GROUP ALL;
SELECT message, count() AS n FROM error_logs GROUP BY message ORDER BY n DESC LIMIT 20;
```

Also record: host disk usage of the SurrealDB data volume (`du -sh`), the size of the latest full backup, and `docker logs pandablog-app 2>&1 | wc -l`.

The expected finding is that `127.0.0.1` with path `/` (the healthcheck) is a large share of rows. These queries may be slow on 600K rows; run them off-peak.

## 3. Default excluded paths (LOG-1.6)

New `defaultLoggingSettings().excluded_paths`:

```ts
[
  '/_nuxt', '/favicon', '/api/admin/logs',
  '/api/health',          // healthcheck (LOG-1.5)
  '/api/analytics/track', // already recorded by analytics module
  '/__nuxt_error',        // Nuxt error rendering
  '/_i18n'                // locale assets
]
```

Check every entry against routes that actually exist (`server/`, `public/`, nuxt modules), and remove entries for routes that don't exist. Nuxt Image/IPX is removed, so `/_ipx` is no longer a default exclusion. Preserve legacy or admin-configured exclusions already stored in the database; reset uses the current defaults.

**One-time merge migration.** Existing installs have `excluded_paths` stored in `app_settings`, so changing the defaults has no effect for them. Add the marker migration `__logging_excluded_paths_v2` in `db-init.ts`. It loads the stored logging settings, **adds** (set-union, keeping order) the new default entries, persists, and sets the marker. It must never remove entries the admin added. It runs in the boot phase, which is cheap (a single row).

## 4. Lightweight health endpoint (LOG-1.5)

New `server/api/health.get.ts`:

```ts
// GET /api/health          → 200 {"ok":true,"uptime_s":123}
// GET /api/health?db=1     → also pings DB with `RETURN 1` (timeout 2s); 503 {"ok":false,"db":"down"} on failure
```

- No auth, no session, no DB by default. It must stay cheap.
- Response headers: `cache-control: no-store`.
- Must work when the site is in private or maintenance mode. Check `server/middleware/site-visibility.ts`, `restore-maintenance.ts`, and `api-origin.ts`, and allow-list `/api/health` where needed.
- Don't leak the version or build info (the CLI `panda info` covers that).

Update `bin/panda.mjs` `cmdHealth`: the default URL becomes `http://127.0.0.1:$PORT/api/health`. Keep `--url` working, and keep the "non-5xx = healthy" rule. Update the help text and `docs/versioning-and-cli.md` if it mentions the URL.

The Docker healthcheck in `deploy/production/docker-compose.yml` already runs `panda health`, so no compose change is needed. Mention the change in progress.md, because an old image paired with a new compose (or the reverse) still works.

Even without the excluded path, the access-logging middleware must skip `/api/health`. Hardcode it as an always-excluded path (in `shouldRecordAccessLog` or the middleware), so an admin can't remove it by mistake.

## 5. Tests

- `logging-logic.test.ts`: `/api/health` is never recorded, even with an empty `excluded_paths`.
- Pure merge helper `mergeExcludedPaths(stored: string[], defaults: string[]): string[]` that keeps order, dedupes, and keeps custom entries.
- Health handler unit test, if the project has a pattern for handler tests. Otherwise, add a manual verification step in progress.md.

## 6. Acceptance criteria

- [ ] `curl -i localhost:3000/api/health` → 200 in < 20 ms, and no access-log entry is written.
- [ ] `docker inspect --format '{{.State.Health.Status}}' pandablog-app` → `healthy` with the new image.
- [ ] Daily access rows drop by about 2,880 (verify with the LOG-0.1 queries after 24 h).
