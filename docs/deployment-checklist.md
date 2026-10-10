# Deployment checklist

For each candidate, record its full commit SHA, image digest, config/schema changes,
operator and change window. Commit datetime + SHA identifies source; a tag alone does
not pin an artifact. This checklist is not deployment authorization and does not waive
outstanding [hardening acceptance](backend-hardening/release-handoff.md) or other project
acceptance. The hardening evidence checker is project-specific, not required machinery
for every future release.

## Before cutover

- [ ] **Verify locally.** GitHub CI is not currently used. On the Node version in
  `.node-version`, run `npm run lint`, `npm run lint:css`, `npm run typecheck`,
  `npm run test:unit`, and `git diff --check`; record results/skips/failures. Keep fault
  tests. Run applicable real-DB regressions through the [guarded harness](backend-hardening/harness.md).
  Production build/module/browser/Linux/constrained-load acceptance is separate; use
  owned fixtures, not the configured checkout, existing app server, `.env` or live data.
- [ ] **Back up and verify recovery.** Retain a consistent DB/media generation, runtime
  config and relevant logs/history/receipts in operator-controlled storage. Verify a
  restore on an explicitly approved isolated target. See [backup operations](backup-simplification/operations.md).
- [ ] **Prepare rollback.** Pin the previous and candidate image digests; verify DB/schema,
  media/config and credential/session compatibility. Preserve post-cutover writes before
  rollback; an image switch alone may not be safe. See [maintenance operations](maintenance-simplification/operations.md).
- [ ] **Check persistence and replacement.** Verify storage/journal/temp/media/log mounts,
  UID/GID, disk headroom and measured resource limits. Guarantee one app instance:
  stop/remove the old app before creating its replacement; no rolling overlap or
  uncoordinated external writer. Preserve recovery records—do not delete them to force boot.
- [ ] **Preserve deployed themes.** No DB migration is needed for theme upload/delete retirement.
  Keep existing `active_theme` and light/dark settings. Preserve custom files under `themes/<id>/`
  and include them in the candidate deployment, or select a retained theme before cutover.
  The supplied image bakes in `/app/themes`; Compose persists only `/app/storage` and DB/media
  backups do not include theme files. Do not discard old custom directories automatically.
- [ ] **Verify the actual proxy.** Check TLS/canonical origin, forwarding configuration,
  private-media/cache policy and access-log redaction/persistence. Purge preexisting
  public CDN/proxy media entries before relying on the new privacy boundary. Preserve
  legacy access history; see [proxy cutover operations](access-log-simplification/operations.md).
- [ ] **Authorize the candidate.** The operator reviews outstanding findings and project
  acceptance, approves this image/config/cutover and names rollback triggers and an owner.

## After cutover

- [ ] **Check identity and readiness.** Confirm `panda info` and the deployed image digest.
  Check `/api/health` for liveness and `/api/ready` for readiness; a live process alone
  does not prove initialized DB/schema or completed restore recovery.
- [ ] **Smoke-test through the proxy.** Verify owner login, expected stale-session rejection,
  roles, CSRF, private media, public rendering, media upload, theme preview/activation,
  light/dark mode and job/status behavior using
  approved test accounts/data. Never rehearse destructive restore on the live target.
- [ ] **Observe and retain rollback.** Review errors, queues, DB/RSS/disk/latency and the
  overnight/UTC-rollover scheduled jobs. Keep verified backups and rollback artifacts
  available; investigate unexplained recovery, credential or resource warnings.
