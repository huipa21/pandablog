# Phase 1 current-identity route audit (REV-1.1)

Local source/H3 audit, not deployed Nitro/browser approval. Every role below means **current active account + matching opaque epoch**. In single-user mode, all authenticated lanes additionally require the designated `users:admin` owner; no cookie role is promoted. Optional-auth failure is not anonymous authorization: identity DB failure returns 503.

## Administrative and media inventory

Patterns include every static/dynamic handler in the named directory, including index, bulk, individual record and nested version/job routes. Authorization is implemented by the handler/helper, **not inferred from the path**.

| Routes | Actor / additional policy |
|---|---|
| `/api/admin/settings/**` (general, media, versioning, logging, analytics, security/webhook test) | superadmin |
| `/api/admin/site/visibility` GET/POST | superadmin |
| `/api/admin/backups/**` (settings, status, tables, create/list/detail/delete/import/restore/download) | superadmin; maintenance ownership/recovery remains REV-2.* |
| `/api/admin/themes/**` | superadmin |
| `/api/admin/logs/**` (static list/stats/retention/cleanup and dynamic type/detail/export/bulk/purge) | superadmin |
| `/api/admin/analytics/**` | superadmin |
| `/api/admin/users/**` | admin tier; target-role/self/seed-owner restrictions in `user-management.ts` and handlers retained |
| `/api/admin/system/version` | admin tier; existing non-secret build-version read policy retained |
| `/api/admin/posts/**` (including locks, bulk and version restore/read/delete), `/api/admin/tags/**`, `/api/admin/categories/**` | content manager; existing ownership/reference/target checks retained |
| `/api/admin/dashboard/**`, `/api/admin/upload`, `/api/admin/annotate`, `/api/admin/media/**` | content manager |
| `/api/admin/auth/devices/**` (list/rename/revoke/revoke-all) | **current self, including viewer**; not an admin-tier restriction despite the path |
| `/api/admin/auth/mfa/status`, `/api/admin/auth/mfa/disable` | current self; disable also requires password and second factor |
| `/api/admin/auth/mfa/setup`, `/api/admin/auth/mfa/activate` | current self with recent-auth/password proof or narrow epoch-bound `enroll` pending actor; pending state never authorizes admin/content routes |
| `/api/media/**` mutation/management routes (upload, bulk, record PATCH/DELETE/metadata, search, folders, smart-folders, tags, owners, orphans/cleanup, archive create/get) | content manager; existing ownership checks retained; REV-1.5 additionally binds archives to current owner/epoch/expiry/source policy |
| Original/file/thumbnail/variant routes under `/api/media/**` and `/media/**` | current optional identity + media visibility/site/hotlink policy; REV-1.5 uses no-store/Vary and denies public IPX media transforms |

## Auth/public/session inventory

| Routes | Actor / policy |
|---|---|
| `/api/auth/login` | bounded first factor against active current account; owner-only when multi-user is off; full cookie stores original verified epoch privately |
| `/api/auth/login/mfa` | current active epoch-bound `verify` pending account; final session stores checked account epoch |
| `/api/auth/setup`, `/api/auth/setup-status` | one-time bootstrap; REV-1.2 uses immutable external setup authority + atomic DB owner/claim, exact origin and bounded body admission; recovery never reopens setup |
| `/api/auth/logout` | session clear; REV-1.2 exact origin/non-browser opt-in policy applies |
| `/api/auth/me` GET/PUT | current self; DTO omits epoch/password, profile MERGE cannot overwrite/renew epoch |
| `/api/auth/change-password` | current self + current password; conditional security update rotates epoch; all sessions including caller require re-login |
| `/api/auth/session` | shared resolver; no cached-cookie outage fallback; private/no-store output |
| Nuxt `/api/_auth/session` | app `sessionHooks.fetch` validates shared resolver, replaces display user, strips pending/enrollment material; Nuxt strips `secure` |
| Public posts (list/detail/related/frequency), search, graph, site/bootstrap/visibility | current optional resolver; no privilege from cookie display role; identity errors propagate rather than become anonymous-public authorization |
| `/api/posts/:slug/unlock` | bounded public password workflow; independent signed post-unlock cookie retains existing contract |
| Analytics tracking | current optional identity for admin/private exclusion; surrounding best-effort tracking remains its documented drop behavior, never private read authorization |

## Regression boundaries

- `current-identity.test.ts`: legacy/copied/recreated/disabled/rotated cookies, current role, owner-mode switch, request-local memoization, DB outage, epoch/time-bound pending enrollment.
- `current-identity-http.test.ts`: real H3 static device-self route (viewer allowed) and dynamic admin-user route (viewer denied), real encrypted copied cookies, app/Nuxt session hooks, role/epoch/owner/active/outage checks and secret-free DTOs.
- `tests/integration/current-identity.test.ts`: guarded real 3.2.4 application SQL for creation/migration/interruption/idempotence, role/active/password/MFA rotations, stale conditional writes/profile MERGE, trusted-device binding/rebinding and delete/recreate.

Full production Nitro routing, disabled-module builds, en/zh-CN browser/proxy checks and cutover approval remain release gates. These tests do not authorize an app startup against configured data.
