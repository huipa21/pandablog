# Maintenance simplification: full-task LLM delegation

**Use this after delegating implementation.** The current session only documented the approved task; it did not change application code. [Progress](./progress.md) is the resume point, [plan](./plan.md) defines tasks and [acceptance](./acceptance-test.md) defines evidence.

## Copyable assignment

```text
Implement the complete approved maintenance simplification in
`docs/maintenance-simplification/`.

Read `progress.md`, `plan.md`, every file under `specs/`,
`acceptance-test.md`, `operations.md`, and this handoff completely.
Follow the referenced backend fixture/verification safety rules and the
unaffected runtime environment/identity contracts. Recheck current code and
Git state; the recorded revisions and file lists are navigation hints.

Execute MS-01 through MS-06 in dependency order as one long assignment.
Do not ask me to approve or run each subtask. Continue through implementation,
regressions, integration, documentation and available verification until the
approved local work is complete or only genuine blockers remain. Record
checkpoints/evidence in progress.md so another session can resume.

Target:
- No persistent application writer lock.
- No expert recovery after ordinary crashes/container replacement.
- Lightweight explicit initialization/readiness and bounded shutdown.
- Serialized backup-family jobs including password-reset CLI participation.
- Traffic/background coordination during actual restore.
- Persistent maintenance recovery only for interrupted destructive restore.
- Preserve DB reconnect/no-replay fixes, auth/privacy/setup protections,
  non-destructive migrations, streaming and finite resource handling.

This package supersedes old writer-lock/startup-only expert recovery
requirements. Do not resurrect them to satisfy obsolete tests, and do not
restore historical files wholesale. A small in-memory readiness/restore
drain mechanism and independent domain receipts are allowed/required where
they preserve existing correctness/security.

Implementation choices within this scope are yours: prefer the smallest
sound refactor; record rationale, migration/API details and deviations.
Add the smallest failing regressions before changing each behavior. Replace
obsolete writer-refusal tests with ordinary restart acceptance, retaining
real interrupted-restore/security/bounds coverage. Check all background,
cache, setup, CLI, packaging, legacy artifact and module call sites.

Never use my `.env`, existing storage, configured DB/app, accounts or
containers for tests. Use only generated owned disposable storage/processes,
sanitized child environments, loopback fixture DBs and owned source copies.
Do not deploy, clear/archive user receipts, reset passwords, rotate secrets,
run production migrations/restores, operate on an unapproved production copy,
or commit/push unless separately requested. Preserve unrelated dirty changes.

Use supported Node 22 and guarded stable SurrealDB 3.2.x for required checks;
record exact builds/SDK/Nuxt/Nitro/OS, commands/counts/skips and evidence tiers.
Actual Nitro/dev/full-app/module/CLI and Linux/container crash coverage is not
proved by mocked unit tests. Run all available acceptance checks; record
missing environments/unrelated baseline failures honestly, continue independent
work, and do not fabricate passes or update old release evidence as passed.

Pause only for a genuine scope/security/data/API/deployment decision or when
no eligible work remains because required verification/runtime is unavailable.
Do not stop for ordinary task boundaries. Unfinished unrelated backend Phase 4
or operator release gates do not block starting this refactor, and are not
implicitly completed by it.

At handoff report changed behavior/files, compatibility/upgrade implications,
exact verification results, remaining blockers/operator gates and next action.
Clearly state that no user DB/storage/deployment was operated on.
```

## Autonomous execution checklist

1. **Orient:** record candidate revision/dirty state, read source and installed runtime, assess fixtures. MS-00's docs completion is not a code pass.
2. **Characterize:** inventory producers/consumers, old/new restore formats, actual SDK cancellation/replay behavior and CLI cross-process jobs. Reproduce old ordinary-crash failure on owned targets.
3. **Refactor coherently:** explicit boot flight/no app receipt -> restore-scoped jobs/drain/durability -> legacy/CLI -> background/cache/modules/docs. Intermediate states are not deployable releases.
4. **Verify incrementally:** deterministic clocks/rendezvous and owned failure injection; targeted tests after each coherent change; keep regressions tracked, not ignored/expected-fail in the final suite.
5. **Record:** update task/acceptance mapping, design decisions, sanitized command/version/count results and remaining gaps at each checkpoint. Plans/specs change only for explicit contract corrections; progress is the status ledger.
6. **Finish:** run combined Node/DB/runtime/module/Linux checks; review for renamed persistent owner latches and security regressions; reconcile active instructions; leave operator gates pending.

## When to stop or resume

Routine code decisions, removing an obsolete test assertion, naming a small helper, translating changed text and selecting an existing compatible primitive are not approval checkpoints. Continue.

Stop for new data deletion/retention policy, changed auth/role/privacy guarantees, newly required distributed topology or incompatible backup/API change not authorized by this plan. Explain the concrete evidence and smallest safe alternative.

An unavailable Node/DB/Linux/container/browser environment is an evidence blocker, not permission to test the user's deployment. Run eligible independent work first, then report what remains. An unrelated build failure should be reproduced safely and boundedly, not trigger an unrequested bundler rewrite.

After interruption/compaction, read progress first and rerun affected checks against current state. Do not reuse old source/test evidence as a pass for changed code. The final record distinguishes local code completion, missing local acceptance and external operator deployment approval.
