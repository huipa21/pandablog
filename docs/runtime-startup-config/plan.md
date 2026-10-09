# Runtime startup and environment configuration: change plan

> **Approved maintenance simplification follow-up:** [maintenance-simplification/plan.md](../maintenance-simplification/plan.md) now governs the next single-instance lifecycle refactor. It supersedes persistent app-writer ownership and ordinary-crash expert recovery requirements here, not canonical environment/scoped identity/security contracts. Implementation is pending; historical tasks/evidence below remain unchanged. Delegate the full task using its [handoff](../maintenance-simplification/handoff.md).

**Status: RSC-01–03 core implementation and local regressions exist; final acceptance is incomplete.** Read [progress.md](./progress.md) first. [operations.md](./operations.md) describes the implemented contract and remaining build/release gates. No configured application startup, deployment or operator storage recovery has been performed.

This package records the investigation of recurring maintenance ownership errors, ROOT runtime fallback, inconsistent environment names, and the footer attribution flag. It supplements [backend hardening](../backend-hardening/plan.md); it does not erase historical test results or authorize deployment.

## 1. Findings and priorities

| ID | Finding | Evidence | Priority |
|---|---|---|---|
| START-01 | Ownership failure can leave service unfenced: Nitro 2.13.4 does not await async plugins; `00-maintenance.ts` installs protection only after awaiting ownership | Source inspection and isolated actual-plugin reproduction; no real Nitro server acceptance yet | Critical safety prerequisite |
| START-02 | A stale `.writer.lock` repeatedly blocks startup; writer receipts deliberately cannot be reclaimed automatically | Read-only local receipt/PID inspection and source inspection | Preserve recovery authority; improve lifecycle and diagnostics |
| DB-01 | Missing both scoped credentials selects ROOT for ordinary runtime queries | Configuration-key presence and source inspection | High production blast-radius concern |
| ENV-01 | Development aliases are evaluated by `nuxt.config.ts`, while the built server uses matching `NUXT_` runtime overrides | Source inspection | Unify documentation, parsing, and precedence |
| ENV-02 | Production sample sets `APP_SPONSOR`, which does not override an already-built server's public runtime config | Source inspection | Correct sample and test production behavior |

A dead application PID is not proof that submitted DB work stopped. ROOT fallback is intentional compatibility behavior, not evidence of an exploited vulnerability. DATABASE EDITOR reduces scope but still has broad permissions inside that database; process compromise can still access the application's ROOT secret.

## 2. Scope and constraints

- Retain one app writer, persistent maintenance receipts/journals, separate runtime and privileged DB identities, and conservative offline recovery.
- Protect startup before ordinary handlers, migrations, schedulers, settings loaders, or deferred backfills can run.
- Use standard Nuxt environment names and require scoped runtime credentials in both development and production; no ordinary runtime ROOT fallback in either environment. The user will supply credentials independently for each environment; consistent policy does not require reusing production secrets locally.
- Rename footer attribution to `public.footerShowPoweredBy` / `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY`; use canonical names only, without deprecated aliases (D-03).
- Supply a root `.env.example` for development alongside the production template; required secrets must be visible and non-usable defaults.
- Keep all secrets outside public runtime config, client bundles, diagnostics, and committed fixture data.
- Do not rotate credentials, edit the user's `.env`, clear storage, start the configured DB/app, or run production recovery as part of implementation tests.
- D-04: ROOT bootstrap creates namespace/database/scoped user only, closes before scoped schema/migrations, and is optional on subsequent ordinary starts. Existing privileged backup/restore still requires ROOT; moving that maintenance to external tooling or making it ROOT-free is separate design work.
- No changes to analytics/logging retention, historical media converters, auth epoch policy, or backup formats are implied.

## 3. Specs

| Spec | Requirements |
|---|---|
| [01-startup-ownership](./specs/01-startup-ownership.md) | Explicit startup coordination, fail-closed admission, recovery, shutdown, actual Nitro tests |
| [02-environment-contract](./specs/02-environment-contract.md) | Canonical-only names, precedence, root/production templates, public attribution, container semantics |
| [03-database-identities](./specs/03-database-identities.md) | Scoped runtime policy, separate ROOT work, validation, privilege/security acceptance |

Also retain [backend architecture](../backend-hardening/specs/00-architecture.md), [DB requirements](../backend-hardening/specs/04-database.md), [maintenance requirements](../backend-hardening/specs/05-backups-and-maintenance.md), and [verification rules](../backend-hardening/specs/09-verification.md).

## 4. Implementation tasks

### RSC-00 — Investigation and documentation
- Dependencies: none.
- Deliverables: this package, evidence ledger, operational caveats, links from existing backend docs.
- Acceptance: findings distinguish observation, synthetic reproduction, proposed behavior, and unavailable deployment evidence; links and diff checks pass.

### RSC-01 — Fail-closed startup and lifecycle
- Dependencies: RSC-00.
- Spec: 01.
- Likely files: `server/plugins/00-maintenance.ts`, `server/plugins/db-init.ts`, startup coordination/maintenance utilities, background plugins, health/status handlers, lifecycle tests.
- First regression: drive plugins using Nitro's actual non-awaiting lifecycle; ownership rejection must never leave ordinary admission open or start boot writes.
- Deliverables: synchronous protection and shutdown registration, explicit shared startup state/promise, serialized ownership-before-initialization, private boot authority, handled errors, bounded close, sanitized diagnostics.
- Acceptance: startup/recovery/contention/failure routes and boot/background writes follow the state machine; clean start/stop/start and development worker reload pass using owned fixtures; unclean restart still refuses takeover.
- Important: do not solve this by catching and ignoring rejection, deleting receipts, or broadly exempting boot queries from fencing.

### RSC-02 — Unified environment names and attribution flag
- Dependencies: RSC-00; coordinate with RSC-01 for startup validation.
- Spec: 02.
- Likely files: `nuxt.config.ts`, an isolated config parser if needed, `Readme.md`, `.env.example`, `deploy/production/.env.example`, config tests, production-server fixtures.
- Deliverables: canonical-only `NUXT_` / `NUXT_PUBLIC_` names, explicit process/file/default precedence, coordinated footer rename to `public.footerShowPoweredBy` and `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY`, no deprecated alias lookup, strict boolean validation, root development and production examples with the same names.
- Acceptance: canonical-only development config, deprecated aliases ignored in development and built runtime, canonical process/file conflicts, explicit empty values, production overrides, example completeness, public attribution, and secret non-disclosure are tested.
- Do not modify the local secret-bearing `.env` automatically. Footer-property rename is required by approved D-02; update all consumers and examples together.

### RSC-03 — Consistent scoped runtime credential policy
- Dependencies: RSC-01, RSC-02; D-01 is approved.
- Spec: 03.
- Likely files: `server/utils/db.ts`, startup config validation, production sample/README, DB identity tests.
- Deliverables: require both scoped runtime credentials in development and production, remove ordinary runtime ROOT fallback without an opt-out, validate before privileged side effects, DATABASE-scoped runtime/schema/migration sign-in, ROOT-only optional namespace/database/user bootstrap with disposal before scoped work, explicit privileged maintenance, sanitized configuration errors.
- Acceptance: absent/partial/invalid scoped credentials fail safely; ROOT creates no tables and disposes before scoped schema; ordinary restart/reconnect works after ROOT removal; failed scoped auth never downgrades; actual stable 3.2.x full schema and restore credential refresh remain correct.

### RSC-04 — Combined verification and final operational documentation
- Dependencies: RSC-01–03.
- Specs: all; backend spec 09.
- Deliverables: supported Node 22 / exact installed Nuxt-Nitro-H3-SDK and stable SurrealDB build evidence; actual production-server and dev reload tests; corrected operator instructions and progress entries.
- Acceptance: lint, typecheck, unit suite, production build/smoke, relevant optional-module builds, isolated DB/lifecycle regressions, links and `git diff --check`; report unrelated existing failures explicitly.
- Release remains subject to the broader backend release gates and explicit operator authorization.

## 5. Approved decisions (2026-10-07)

| ID | Approved contract | Implementation effect |
|---|---|---|
| D-01 | User will provide scoped runtime credentials; development uses the same credential requirements and policy as production | Require both credentials in all environments; no ordinary runtime ROOT fallback or dev exception; retain ROOT only for explicit privileged work |
| D-02 | Rename the footer setting for consistency | Canonical property `public.footerShowPoweredBy` and variable `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY`; update consumers, examples, validation and canonical-only tests |
| D-04 | ROOT only bootstraps namespace/database/scoped user; scoped identity creates schemas; remove ROOT for subsequent normal starts | Optional ROOT bootstrap, close before scoped schema/migrations, ROOT-free normal restart; current privileged maintenance remains explicitly ROOT-dependent |
| D-05 | Root example includes 4096 MiB Node option; verify E2E admin variables | Add `NODE_OPTIONS`, retain test-only E2E names and isolated loader/config regressions |
| D-06 | Avoid normal-startup reprovisioning; audit all development E2E credential usage | Create missing scoped users only; retain explicit restore refresh; keep scoped runtime without claiming protection against RCE with ROOT present; audit ignored and tracked E2E specs |
| D-07 | Simplify ordinary startup recovery without weakening restore safety | No new marker for verified pre-mutation failures; bounded verified owned cleanup, plain maintenance guidance, and a local assistant for read-only inspection/operator-reviewed startup-only archival. Legacy ambiguity and interrupted restores stay conservative; no deployed recovery is performed by implementation tests. |

“Same as production” means consistent variable names and security policy, not copying production passwords or targeting production from local development. No secrets are requested in conversation.

**D-03 (user follow-up): add a root `.env.example` and remove all deprecated environment-name aliases.** This supersedes the initial compatibility-retention proposal. Old unprefixed application names and old attribution names are ignored; operators must migrate to canonical names before upgrading. Deployment/credential changes and offline recovery still require independent operator approval.

## 6. Implementation handoff

Read progress, the task and relevant specs; recheck source and installed runtime behavior. Add the smallest regression first. Test only generated, owned DB/storage/process fixtures, never configured application data. Update progress with exact versions, commands, evidence tier, decisions and remaining blockers. Do not label an awaited plugin unit test as proof that Nitro awaits plugins.
