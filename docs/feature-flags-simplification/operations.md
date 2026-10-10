# Feature-flag simplification: operator upgrade notes

**Working-tree plan; not deployment-approved.** This explains what changes for someone running PandaBlog when they upgrade to a build without `pandablog.modules.json`. It does not authorize operating on any deployment.

## 1. Summary

- There is one build. All features are compiled in. **There is nothing to select before building.**
- Optional behavior is controlled in the admin UI (table below). Changes take effect without a rebuild.
- Every content block type always renders on public pages, so posts that used a previously disabled block now display correctly.
- If a `pandablog.modules.json` file is still present, the build prints a warning that lists every value you had set to `false`. The file is otherwise ignored. Delete it after reviewing section 2.

| Optional behavior | Where | Default |
|---|---|---|
| Analytics collection | Settings → Analytics → "Enable analytics collection" | Off |
| GeoIP country/city | Put `dbip-city-lite.mmdb` at `NUXT_GEOIP_DB_PATH` (default `storage/geoip/dbip-city-lite.mmdb`) | Off until the file exists |
| Security alert webhook | Settings → Security | Off |
| Require MFA for admins | Settings → Security | Off |
| Activity / error logging, retention | Dashboard → Logs → Settings | On |
| Knowledge graph (`/graph`, widgets) | Settings → General → Public features | On |
| Publishing heatmap | Settings → General → Public features | On |
| Post history snapshots per post | Settings → Versioning | 20 |

## 2. If your old manifest disabled something

If your old manifest was all `true` (the repository default), skip this section; nothing changes for you.

Otherwise, before exposing the upgraded build to users, go through each `false` value that the build warning printed:

| Old manifest value | What happens after upgrade | What to do |
|---|---|---|
| `modules.editor.enabled` or any `modules.editor.blocks.*` = false | All blocks appear in the editor; stored content of those types now renders | Nothing. To avoid a block, simply don't insert it |
| `modules.logs.enabled` / `activityLogs` / `errorLogs` = false | Logging code is active. Its settings default to on | Dashboard → Logs → Settings: turn off logging, or activity/error logging, if you want them off. The first boot creates the log tables (empty) |
| `modules.analytics.enabled` = false | Analytics code is active, but collection obeys `analytics_enabled` (default **off**) | Settings → Analytics: confirm "Enable analytics collection" is off. Post view counts continue as before |
| `modules.analytics.geoip` = false | GeoIP lookups run only if the `.mmdb` file exists | Don't place the file, or remove it |
| `modules.users.multiUser` or `modules.users.enabled` = false | **Single-user mode is gone. Every active account can log in again with its role.** | **Before upgrading**, review Users and deactivate any account that should not have access. In single-user builds that list was hidden; check it immediately after the first login, before announcing the upgrade |
| `modules.themes.enabled` / `bundled.*` = false | All bundled themes are available; the active theme is unchanged | Nothing, unless you want to restrict who can switch themes (superadmin only, unchanged) |
| `modules.mfa.enabled` = false | Users who enrolled MFA earlier are challenged again. If `security_mfa_required_for_admins` is saved as on, admins must enroll at next login | Make sure admins still have authenticator/recovery codes. Check Settings → Security |
| `modules.securityAlerts.enabled` = false | Alerts send only if `security_alerts_enabled` is on and a webhook is set | Settings → Security: confirm alerts are off if unwanted |
| `modules.backups.enabled` = false | The Backups page and APIs (superadmin) are available. The first boot creates the backups table. No backup runs automatically | Nothing. Keep enough disk if you start taking backups |
| `modules.graphView.enabled` = false | The graph is visible again | Settings → General → Public features: turn off "Knowledge graph" |
| `modules.publishActivityHeatmap.enabled` = false | The heatmap is visible again | Settings → General → Public features: turn off "Publishing heatmap" |
| `modules.postVersioning.enabled` = false | Publishing/editing now records version snapshots, bounded by the snapshot limit | Settings → Versioning: set the limit you want (1–200) |

**Database:** if logs, analytics or backups were disabled, the schema hash differs and the first boot re-applies the standard schema once. This creates the missing tables. No existing data is removed by this change. All-enabled installs keep the same schema hash, so nothing is re-applied.

## 3. Caching

The public bootstrap is cached for 30 s and refreshed on every settings save. Graph and heatmap APIs follow a toggle immediately. The home page HTML is cached with stale-while-revalidate (about 60 s, plus up to 120 s stale), so a widget may stay visible or hidden for up to about two minutes after a toggle.

## 4. Docker builds

- Delete the "select modules" step from your build routine. `npm run container:build` builds the full image.
- The image always contains every bundled theme and the ~17 MB Japanese annotation dictionary.
- The GeoIP database is still **not** in the image; mount it as before.
- If your CI previously ran `npm run configure` or `npm run modules:print`, remove those calls; the scripts no longer exist.

## 5. Rollback

Rolling back to a previous image is supported:

- No data was migrated or deleted.
- Extra tables created by the upgrade stay unused by an old build that had those modules disabled.
- An old single-user build would again restrict login to the owner account.
- The two new public settings are ignored by older builds.

## 6. Verification after an authorized upgrade

1. Open a post that contains code, math, mermaid, dialogue and table blocks. All of them render.
2. As superadmin, open Settings → General and turn "Knowledge graph" off. `/graph` returns 404 and `/api/graph/overview` returns 404. Turn it back on.
3. Check that Settings → Analytics/Security and Dashboard → Logs → Settings show the values you intend.
4. Previously single-user installs: Users lists only the accounts you expect as active.
