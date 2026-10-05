# Spec 01: Authentication, authorization and password-work safety

Tasks: **REV-1.1, REV-1.2, REV-1.3**. Findings: F-01, F-02, F-05, F-06, F-15, F-17, F-25.

## 1. Baseline

`auth.ts` trusts identity/role from a sealed session; user mutations do not invalidate it. Single-user mode promotes every session. MFA recovery codes use read/filter/write, and TOTP verification returns only a boolean. Filesystem rate counters are non-atomic and their TTL option is ignored. Auth mutations are exempt from the origin middleware.

Preserve Argon2id (`memoryCost=65536`, `timeCost=3`, `parallelism=4`) unless benchmark/security review justifies a change. Preserve AES-256-GCM encryption, random TOTP secrets, httpOnly cookies, secure production cookies, and short pending-state TTLs.

## 2. Identity contract (REV-1.1)

### Persistent identity

Add `users.auth_epoch`: an opaque cryptographically random token with at least 128 bits of entropy. It is generated on account creation and replaced on revocation. An epoch is preferable to a reset-to-zero counter because deleting/recreating `users:<username>` must not reactivate old cookies.

- Cookie session includes user ID and epoch. Role/display fields may remain for client display but are never authoritative.
- Existing rows are migrated idempotently before they may authenticate; **legacy cookies without an epoch must reauthenticate**. Do not retrofit an epoch into an old cookie on first use.
- Never expose the epoch or password/MFA fields through public/user-list DTOs or logs.
- Resolve `{ id, username, role, active, auth_epoch }` once per request. `getSessionUser`, `requireUser`, Nuxt session-fetch hooks/endpoints, media/graph/post access and MFA actor resolution use the same resolver.
- No-cookie requests can skip identity DB work. An invalid/revoked cookie may be cleared; a DB outage is distinguishable from anonymous access and fails closed on privacy-sensitive decisions.
- `requireUser`'s setup check must not load the full owner's credential record on every call. Setup state is immutable after successful enrollment except through an explicit recovery process.

### Rotation rules

Atomically mutate security state and rotate epoch for password change/reset, role change, disable/re-enable, MFA enable/disable, and explicit revoke-all if exposed. Deletion makes resolution fail; recreation generates a fresh epoch. Password/MFA changes revoke trusted devices unless a specifically documented self-preservation policy is implemented and tested. Do not silently preserve a stolen trusted-device token.

The current self-service session may be replaced with the new epoch **only after** the required credential/recent-auth checks. Other sessions and pending MFA states remain invalid. A stale in-flight profile write cannot restore an earlier epoch.

## 3. Owner mode and route audit (REV-1.1)

Disabling multi-user mode authorizes only the configured/designated owner (currently the setup-created `users:admin`, confirmed in source). It must not map all valid roles to superadmin. Non-owner login/session access is rejected in this mode, including cookies issued before the switch.

Inventory every `server/api/admin/**`, mutation under `server/api/media/**`, auth endpoint, private post/media read and Nuxt auth utility route. Record the intended actor:

- Owner/superadmin: settings, backups, themes, logs, analytics, site visibility.
- Admin/content roles: existing content/user management policies, with target/ownership checks retained.
- Self-service MFA/device endpoints: current user only; pending enrollment is a narrow exception, not an admin session.
- Public routes: no privilege from unvalidated cookie display fields.

Use real H3 route tests to catch static/dynamic wrappers inheriting the wrong authorization. Do not impose admin-tier roles on self-service device/MFA endpoints just because their path starts with `/api/admin`.

## 4. MFA and pending-state consumption (REV-1.2)

- Pending verify/enroll state contains account epoch, issue time and mode. Reject future/expired issue times and epoch mismatch. Recheck account `active` and current MFA state before issuing a session.
- `verifyTotpToken` must expose the accepted timestep (or equivalent verified counter from otplib). Atomically claim it by comparing to the last accepted timestep. The same token/timestep cannot authorize multiple attempts across separate pending cookies or parallel requests. Test drift-window behavior, especially accepting a future step then receiving an earlier code.
- Recovery-code consumption is a conditional atomic mutation of the **matched hash**, not replacement with a stale filtered array. Exactly one concurrent claimant succeeds. Two different simultaneous claims must not restore either consumed code.
- Keep slow hash verification outside a long DB transaction; then perform a compare-and-swap/transaction on the verified hash and epoch/MFA state. Retry only confirmed transaction conflicts, not ambiguous disconnects.
- Enrollment activation atomically checks disabled-MFA state, account epoch/active status and stores secret/hashes. Competing enrollment cannot overwrite an already activated secret.
- Sensitive self-service MFA changes require password/second-factor or a documented recent-auth window. Audit exact existing flows; possession of a stale full session is not sufficient to replace MFA.
- Derive the encryption key asynchronously once per configured key source/process, cache only the bounded key material, and document key rotation/re-enrollment. Validate IV/tag/ciphertext structure before decryption; do not log secret material.
- Generate backup-code hashes through the shared KDF limiter, not an unconstrained ten-element `Promise.all`.

## 5. Atomic setup (REV-1.2)

`setup.post.ts` must not rely on `readAdminCredentials()` followed by a later overwrite-capable write.

- Parse/validate bounded input, reserve rate/KDF capacity, then atomically create the owner and claim one-time setup state.
- A concurrent loser receives 409 and cannot call a password-update branch on the winner's account.
- DB read failure is 503, not evidence that setup is available. Once initialized, owner absence/disablement is an administrative recovery state, not open setup.
- Setup is forbidden during restore/failed-recovery maintenance, even if imported tables are momentarily missing.
- Test interruptions between hashing, transaction commit and cookie issuance; committed setup remains complete even if the response is lost.

## 6. Browser mutations and inputs (REV-1.2)

- Remove the blanket `/api/auth` CSRF/origin exemption. Apply safe-method exceptions only where genuinely read-only.
- Check `Sec-Fetch-Site` and exact canonical origin (scheme + host + port), not only host. Use configured/trusted-proxy origin resolution; raw attacker-supplied forwarding headers cannot establish trust.
- Browser form/text/plain login, logout, setup, password change and profile mutation from an untrusted origin must fail. If a token scheme is needed for clients without reliable metadata, design it explicitly; do not assert that all missing-Origin clients are non-browsers.
- Preserve intentionally supported non-browser API clients through a documented non-ambient-credential policy.
- Use runtime schemas for all auth bodies and finite byte/string limits. `readBody<T>` is not validation. Apply body caps before buffering/expensive work where possible.
- Login password verification rejects invalid/oversized inputs and uses a fixed dummy hash for nonexistent users if preventing account enumeration is part of the policy. Rate/KDF limits still apply to dummy work.

## 7. Atomic rate limiting and KDF admission (REV-1.3)

### Initial deployment decision

Support one app process without a new external service. A process-local atomic bounded limiter with explicit expiry/LRU is acceptable if restart resets are documented and the reverse proxy supplies coarse abuse protection. A persisted design is also acceptable, but it must provide real atomic updates and expiry/sweep; unstorage fs `ttl` does neither. Document the choice before implementation. Do not claim distributed correctness for a local lock.

### Semantics

- Reserve attempts **before** password/TOTP/KDF work. Fixed-window/check+record races are not acceptable.
- Limits cover both IP and account/target dimension where appropriate; hashing normalized user/target identifiers avoids path injection or enormous key names. Unknown-slug unlock requests cannot create unlimited permanent keys.
- A correct password that still requires MFA must not clear the final-auth failure budget prematurely. Keep separate first-factor and MFA budgets with defined reset behavior.
- Configure finite maximum keys and sweep expired keys even if they are never used again. Expired persisted fs records need an explicit cleanup migration if the backend changes.
- Use Retry-After and stable 429 responses; analytics may keep its documented 204 drop behavior.
- Trust X-Forwarded-For only through the supported proxy deployment. The supplied Nginx overwrites it with `$remote_addr`; preserve this and prevent direct public app access. Do not label this existing configuration as an XFF spoofing defect.

### KDF execution

All Argon2 hashing/verification paths (login, unlock, password changes, recovery codes, trusted-device tokens) share bounded admission. Start with spec 00's 2 active/16 waiting budget, measure Node/native memory, and reject/drain/cancel safely. Admission must not introduce a second unbounded queue of request bodies. Releases occur in `finally` on success, malformed hash, timeout, cancellation and shutdown. A running native hash may not be cancellable; aborting the HTTP caller does not make its memory disappear.

## 8. Acceptance evidence

- [ ] Copied session fails after each revocation trigger; recreated account and single-user mode are safe.
- [ ] No revoked/disabled pending state can activate MFA or finish login.
- [ ] Parallel identical recovery-code and TOTP claims have one successful claimant; distinct recovery codes stay consumed.
- [ ] Concurrent setup yields one immutable owner/password and no overwrite by losers.
- [ ] Real H3 browser-origin tests include top-level form POST, text/plain, same-site sibling origin, absent metadata and trusted proxy resolution.
- [ ] Concurrent limiter test with limit one admits exactly one, using the actual chosen backend as well as unit fakes.
- [ ] Untouched keys expire/sweep; high-cardinality input stays within count/disk budgets.
- [ ] KDF mixed-load RSS/queue metrics stay within configured admission; credentials/epochs never appear in logs/DTOs.
