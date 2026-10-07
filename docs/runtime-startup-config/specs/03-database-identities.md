# Spec 03: Runtime database identity and consistent credential policy

Tasks: RSC-03, RSC-04 in [plan](../plan.md). **D-01 strict scoped credentials and D-04 ROOT-only bootstrap/scoped-schema startup are implemented; full-app startup/build acceptance remains pending in [progress](../progress.md).** Preserve [backend DB](../../backend-hardening/specs/04-database.md) and [restore](../../backend-hardening/specs/05-backups-and-maintenance.md) contracts.

## 1. Investigation baseline and threat assessment

Before RSC-03, `server/utils/db.ts` chose DATABASE when both credentials existed, rejected partial configuration, and warned/fell back to ROOT when both were absent. The implementation now requires the pair in every environment and retains no ordinary runtime ROOT fallback. Scoped authentication failure remains a sanitized handshake failure, never a ROOT retry.

ROOT runtime access increases the impact of arbitrary-query/SQL-injection flaws beyond the intended database to privileged operations allowed to the identity. No exploitation is established by this review.

DATABASE EDITOR is a scope reduction, not a tightly customized application role: ordinary data access and some table DDL are allowed. Existing local 3.2.4 evidence is recorded in backend progress; rerun actual required statements on the selected stable 3.2.x build. Do not claim every EDITOR DDL operation fails.

ROOT secrets remain in the process only when explicitly supplied for bootstrap or current privileged backup/restore. They can be removed before the next ordinary container start. Closing ROOT does not erase environment/config secrets from an already-running process; RCE or environment theft can still expose configured secrets. Network isolation, secret management and later external privileged tooling are complementary mitigations, not proof of RCE containment.

## 2. Approved and implemented policy

| Environment / credentials | Required result |
|---|---|
| Development or production: both runtime credentials absent | Configuration failure before privileged initialization; remain closed or controlled exit |
| Any environment: one credential absent | Configuration failure; no ROOT fallback |
| Both configured with invalid identity shape | Configuration failure before SQL interpolation/provisioning |
| Both valid and configured, ROOT bootstrap supplied | ROOT creates namespace/database/user only, closes, then DATABASE identity runs schemas/migrations/runtime |
| Both valid and configured, ROOT absent | Already-provisioned DATABASE identity only; normal startup/schema updates succeed without ROOT |
| Scoped sign-in fails | Sanitized failure; never retry as ROOT |

Apply the same requirements in development and production, without a dev exception or runtime ROOT opt-out switch. Test both real runtime modes. The user will supply scoped credentials through the environment; identical policy does not authorize reusing production secrets or production DB targets in development/tests.

## 3. Startup and maintenance separation

- Validate credential presence/shape, required config and the approved all-environment policy before provisioning, schema synchronization, migrations or media recovery. Do not allow invalid configuration to mutate production first and fail later.
- RSC-01 authorization is a prerequisite for allocating initialization authority.
- With explicitly configured bootstrap credentials, owned boot uses a separate ROOT client only for `DEFINE NAMESPACE`, `DEFINE DATABASE`, and scoped `DEFINE USER IF NOT EXISTS`. Existing user credentials/roles must not be overwritten during normal startup; mismatched configured credentials fail scoped authentication rather than being repaired. Validate identifiers before interpolation and close ROOT safely before scoped authentication. Failed ROOT disposal must not start scoped schema work.
- All application table/field/index/analyzer schema and boot migration work uses DATABASE EDITOR under private boot authority, never ROOT. This includes receipt-verified legacy access table removal.
- Without a ROOT password, do not allocate/sign in any ROOT client during ordinary boot; authenticate the existing scoped user directly. Auth failure stays fenced and never triggers ROOT fallback or automatic user repair.
- Runtime sign-in includes namespace/database; ordinary query routing must not substitute a dedicated ROOT client or downgrade after an authorization error.
- Keep ROOT client tracking/retry/admission isolation and finite connect/query/close budgets. Existing deadlines remain response deadlines, not cancellation proof.
- Backup/export/import/wipe/security DDL use explicit privileged clients/transport credentials and selected DB scope, never caller-supplied auth or accidental runtime ROOT fallback.
- Restore reprovisions/verifies current configured runtime credentials, recycles the shared client and completes existing auth/cache consistency steps before reopening.
- No credential echo in SQL errors, stack/cause logging, endpoint strings, public runtime config or status routes; redact raw/escaped password forms at established boundaries.

## 4. Documentation and migration

- Use canonical scoped credentials in both environments. ROOT bootstrap provisions a fresh target; retain ROOT when current privileged backup/restore is needed. Removing it remains an optional ordinary-startup capability, not the full-feature deployment recommendation.
- With ROOT retained for current backup/restore, boot ensures missing targets/users only; no normal-startup reprovisioning of an existing user. Credential rotation requires explicitly approved provisioning even when ROOT remains available. Restore's deliberate overwrite/credential-refresh path remains separate.
- Existing backup/export/import/wipe/staging/restore still requires explicit privileged credentials. Missing ROOT must fail before network/privileged mutation, not substitute EDITOR. Complete ROOT-free backup/restore is not implemented by this bootstrap change.
- Correct README's “either unset causes ROOT fallback” claim to the current paired-credential contract.
- Document scoped credentials as required in both environments; document ROOT as optional for an already-provisioned ordinary startup, not as permanently required for schema.
- Both development and production samples should make required credential fields visible and non-secret, not merely optional commented suggestions. Do not ship a usable default password.
- Existing deployments without runtime credentials need an explicit migration warning/rehearsal before strict enforcement. Restore from an old image/config is not automatically a safe rollback.
- Changing env names need not rotate credentials. Rotation and operator provisioning need independent approval and verified restore/recovery behavior.

## 5. Acceptance

- Development and production missing/partial/invalid credentials refuse before any privileged side effect; ordinary runtime ROOT fallback is removed, with no environment exception.
- Invalid scoped sign-in never authenticates/retries as ROOT, including reconnect paths.
- Actual stable 3.2.x runtime CRUD/INFO and the entire shipped table schema run as EDITOR; ROOT bootstrap creates no tables. Verify ROOT-free reconnect/schema reentry and denied user/database provisioning, with exact version/build; no blanket permissions inference.
- Dedicated ROOT maintenance stays dedicated; foreground runtime stays database-scoped; client disposal/connection capacity remains bounded.
- Full/partial/rollback restore retains current runtime credential refresh and reopened identity behavior.
- Synthetic passwords containing quotes/backslashes never escape through diagnostics or nested error causes.
- Actual Node 22 development and production startup with owned disposable DB/storage proves identical credential policy and provisioning-before-runtime ordering, not only mocked `signin` calls.

No test may target the configured app DB or use its credentials. Broader release/operator gates remain pending independently of this task.
