# Spec 02: Canonical-only environment names and footer attribution

Tasks: RSC-02, RSC-04 in [plan](../plan.md). **D-03 supersedes the initial deprecated-alias migration proposal: provide a root `.env.example` and retain no deprecated environment-name aliases.** Full-app SSR/build acceptance remains pending in [progress](../progress.md).

## 1. Canonical mapping

Use the same standard Nuxt runtime names in development and production:

| Runtime config property | Supported environment name |
|---|---|
| `surrealUrl` | `NUXT_SURREAL_URL` |
| `surrealNamespace` | `NUXT_SURREAL_NAMESPACE` |
| `surrealDatabase` | `NUXT_SURREAL_DATABASE` |
| `surrealRoot` | `NUXT_SURREAL_ROOT` |
| `surrealRootPassword` | `NUXT_SURREAL_ROOT_PASSWORD` |
| `surrealAppUser` | `NUXT_SURREAL_APP_USER` |
| `surrealAppPassword` | `NUXT_SURREAL_APP_PASSWORD` |
| `appOrigin` | `NUXT_APP_ORIGIN` |
| `mfaSecret` | `NUXT_MFA_SECRET` |
| `geoipDbPath` | `NUXT_GEOIP_DB_PATH` |
| `session.password` | `NUXT_SESSION_PASSWORD` |
| `public.footerShowPoweredBy` | `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY` |

Old unprefixed application names and `APP_SPONSOR` / `NUXT_PUBLIC_APP_SPONSOR` are ignored in all modes. There is no deprecated-name fallback or compatibility property. `NUXT_APP_SPONSOR` is also unsupported. Required credentials supplied only under old names are treated as missing, not downgraded to ROOT. Operators must migrate names before upgrading; the implementation must not edit the user's `.env` automatically.

Database/session/MFA secrets must never enter `runtimeConfig.public` or any `NUXT_PUBLIC_` mapping. Independent process variables (`NODE_OPTIONS`, `LOG_CONSOLE`, `LOG_FORMAT`, `E2E_ADMIN_USERNAME`, `E2E_ADMIN_PASSWORD`) and SurrealDB service variables keep their existing names; they are not application config aliases.

## 2. Loading and precedence

Nuxt dev/config evaluation loads a project `.env`; standalone production runtime receives process environment and does not rerun `nuxt.config.ts`. Compose `env_file` injects process environment. Container recreation is required after changing that environment; restarting an existing container is not enough.

Lookup during development/config evaluation:

1. Canonical process environment value, when defined.
2. Canonical local `.env` value, when defined.
3. Safe declared default.

Use existence/nullish checks rather than truthiness: an explicit empty value must remain empty, not fall back to a file/default secret. Nuxt may load `.env` into process environment before evaluating config, making source provenance indistinguishable. Test the effective resolution using the actual loader, without claiming an unavailable distinction.

Production:

- Canonical process environment overrides built runtime defaults through matching Nuxt properties.
- No deprecated-name lookup exists at runtime or config evaluation.
- Private built defaults stay empty/non-secret so operator secrets are not baked into distributable artifacts.
- Runtime secret/config validation is mandatory even when builds succeed without credentials.
- Diagnostics may describe variable names but must never echo values, nested SDK causes or SQL/passwords.

## 3. Validation and parsing

- Validate required strings and scoped runtime credentials before privileged boot side effects per [spec 03](./03-database-identities.md).
- Retain username identifier restrictions; trim identifiers deliberately, never arbitrarily trim passwords or key material.
- Boolean parsing must produce actual booleans at config evaluation and runtime consumption. Supported case-insensitive spellings are true/false, 1/0, yes/no and on/off; unsupported/empty values reject rather than silently enabling/disabling.
- Do not rely on Nitro deserialization alone to normalize every supported boolean spelling.
- Use a robust dotenv parser preserving supported quotes, comments, multiline values and CRLF. Never dump values or consume the real local `.env` in tests.

## 4. Attribution contract

Canonical `public.footerShowPoweredBy` means “show Powered by PandaBlog with its GitHub link”:

- true: show attribution; false/absent: hide it (default false).
- No payments, ads, sponsor privileges, auth or session behavior.
- Only `NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY` configures it; old names are ignored.
- Update config, all consumers, root/production examples, README and tests together.
- Normalize the canonical value to a boolean before Nuxt serializes SSR/client config.
- An already-built server must toggle it via canonical process environment without rebuilding.
- Unsupported public settings must not break narrow fenced health/readiness/status diagnostics.
- Old deployed images do not recognize the new property; coordinated code/environment cutover remains operator-controlled.

## 5. Examples and acceptance

- Root [.env.example](../../../.env.example) contains canonical DB/scoped/session/origin fields, explicit first-run ROOT bootstrap fields, and the footer flag. Required secrets are deliberately empty. ROOT may be removed after provisioning for normal startup per D-04.
- Include `NODE_OPTIONS="--max-old-space-size=4096"` in the root template, explaining native options must be present before Node launches. Optional application-admin `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` remain Playwright-only process settings; test loader precedence and robust quoting without using real credentials or launching the configured app. Optional MFA/GeoIP and unchanged logging settings are documented.
- [Production example](../../../deploy/production/.env.example) uses the same canonical names with a container DB endpoint and public origin.
- Canonical-only development files and canonical-only production process environments select matching properties.
- Actual config and built-server tests demonstrate deprecated names have no effect, including old attribution true with the canonical flag absent.
- Process-over-file and explicit-empty behavior, robust parsing, supported/rejected booleans, default false and example completeness are tested.
- Runtime endpoint/credentials/origin/attribution overrides are consumed rather than baked sample values.
- Missing/partial/invalid credentials fail safely and never enter public config, client output, nested causes or logs.
- Full Nuxt SSR/client agreement and Node 22 dev/production acceptance remain required; minimal Nitro tests are not a substitute for the full-app build/smoke gate.

Use synthetic config/owned fixtures, never the user's `.env`, storage or configured database.
