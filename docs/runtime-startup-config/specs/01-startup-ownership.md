# Spec 01: Fail-closed startup and shutdown (amended)

> **Narrow supersession:** [maintenance simplification architecture](../../maintenance-simplification/specs/00-architecture.md) and [lightweight startup spec](../../maintenance-simplification/specs/01-startup-and-readiness.md) supersede lifetime writer ownership, stale-writer refusal and ordinary-startup expert archival in this spec. Explicit readiness, handled Nitro startup, safe shutdown and actual destructive-restore protection remain required. The working-tree refactor is implemented; evidence and remaining gates are in maintenance progress. The old contract below is historical, not an instruction to recreate ownership.

Tasks: RSC-01, RSC-04 in [plan](../plan.md). **Implementation contract; consult [progress](../progress.md) for completed evidence and remaining acceptance gates.**

## Current contract

The authoritative lifecycle is [maintenance spec 01](../../maintenance-simplification/specs/01-startup-and-readiness.md): synchronous Nitro gating/close hooks, one explicit boot flight, DB outage retry/no replay, required resumable initialization before readiness, bounded ten-second shutdown, ordinary automatic restart, and no persistent app owner. Actual destructive/ambiguous restore remains conservative. Generation-safe dev drain is process-local; job serialization and independent setup/media/logging receipts survive. Environment/identity specs in this package remain unchanged.

<details>
<summary>Historical RSC writer-ownership acceptance contract (superseded)</summary>

## 1. Problem and invariants

Installed Nitro 2.13.4 invokes plugins without awaiting promises. Merely sorting an async maintenance plugin before `db-init` does not serialize startup. The investigation baseline awaited ownership before request protection and close-hook installation, allowing boot to race an initially open barrier. The implementation now uses synchronous protection and explicit coordination; requirements below remain the acceptance contract.

Required invariants:

1. No ordinary request, background mutation or migration can execute before writer ownership and required initialization are established.
2. Every startup promise/rejection is owned and handled; failure cannot silently leave service open.
3. Existing restore/uncertainty authority and non-reclaimable writer receipts remain conservative. No PID/TTL deletion shortcut.
4. Exactly one process may become an ordinary app writer. External/concurrent DB writers and multi-host deployment remain unsupported.
5. Bounded shutdown cannot imply DB execution cancellation or successful job completion.

## 2. Explicit startup coordination

Implement a shared state/coordinator with equivalent observable states:

| State | Ordinary work | Permitted authority |
|---|---|---|
| starting | denied or bounded wait before admission | none until writer acquisition; then private boot scope only |
| initializing | denied or bounded wait | successfully owned boot work only |
| ready | permitted through normal leases | ordinary runtime and explicitly owned maintenance |
| recovery-required | denied | narrow liveness/status paths only |
| failed | denied | sanitized diagnostics/liveness, or controlled process termination |
| stopping | no new ordinary work | draining previously owned work and cleanup |

The implementer must choose/document a deterministic failed-startup policy: fenced diagnostic service or controlled termination. Neither may fall through to ordinary service. Existing journal recovery retains its narrow status/liveness contract.

- Install admission protection synchronously, before first `await`; cover HTTP/SSR, auth/setup, local fetch and cached route entry points.
- Register close hooks synchronously. A failed or slow ownership attempt must not prevent shutdown participation.
- Use an explicit shared single-flight startup promise, not plugin ordering or a one-time `barrier.closed` check.
- `db-init` must await owned startup authorization before connection/provisioning/schema/FS recovery work. Background plugins/settings/deferred work must wait for the correct state or refuse.
- Private boot operations may run while ordinary admission is closed. They require owner-scoped authority unavailable to request code, preserve query/native/FS leases, and must not deadlock behind the ordinary readiness wait.
- Connect/reconnect/health behavior must not become an accidental write bypass. Inventory initialization side effects outside `db-init`, including module/config/settings loaders.
- Readiness opens only after required provisioning/migrations/recovery validation succeeds. Optional bounded backfills may run later under normal owned admission; do not change which work is mandatory without documenting it.
- Request waits, if selected, have finite duration/admission and no unbounded retained-body queue. Failure responses are sanitized 503 with an appropriate retry policy.

## 3. Failure and recovery

- Distinguish live contention, existing writer receipt requiring offline review, guard/record corruption and restore/uncertainty recovery in internal diagnostics without exposing owner/status tokens, paths containing secrets, SQL or credentials.
- Do not adopt/rewrite/remove another owner's receipt after failure.
- D-07: invalid configuration and trusted handshake failures before any potentially mutating query or application-migration/FS handoff remain closed but need not create persistent uncertainty. Release **only this writer** after bounded, verified client disposal and zero active/uncertain leases. A corrected next process can then start without manual recovery. Error message/status matching alone is not proof; ROOT provisioning dispatch makes a later scoped failure partial initialization.
- Partial/unknown boot failure after acquiring ownership remains closed. Release only when boot/request/DB/native/FS settlement and consistency criteria genuinely permit a clean close; otherwise retain recovery evidence.
- D-07: a local read-only recovery assistant may explain records and archive eligible nonrestore startup receipts after explicit operator quiescence/consistency assertions, under exclusive guarded acquisition with unchanged-record and dead-local-owner checks. It must refuse live/remote/nonempty-corrupt/mismatched/unrecognized/restore authority, preserve an archive, and never import SQL or automatically infer old marker provenance. A completely empty regular writer directory has no owner to probe; reviewed archival requires the same external operator confirmations and guarded emptiness recheck, never automatic abandonment inference. No public unfence endpoint or blind retry of migrations is authorized.
- An unfinished restore, uncertainty marker or unreadable authority never allows migrations or reopens setup.
- Health and status exceptions remain exact and narrow; no blanket `/api/auth` or backup mutation exemption. Existing restore status capabilities remain limited and authenticated as specified by backend spec 05.
- Liveness success is not readiness. Expose/test a readiness contract separately or add documented readiness information without implying existing `/api/health` already validates startup.

## 4. Shutdown and development workers

- Stop new jobs/schedulers and admission, then drain owned work under bounded deadlines.
- Coordinate startup-in-flight with close: a late writer acquisition/initialization must not publish ready state after shutdown begins.
- Remove only this writer's verified token/generation after safe settlement; old close cannot remove a successor receipt.
- Active/unfinished maintenance, uncertain writes or failed drain preserves authority. Never declare an unclean close successful because its caller stopped waiting.
- Clean dev reload should stop/drain the previous worker before another acquires ownership. A PID is process-level, not a unique Nitro worker identity; generation/token checks still apply.
- Forced worker/process termination remains offline recovery unless independent execution/consistency proof exists. Do not enable automatic dev-mode stale takeover of real storage.

## 5. Required regressions

- Non-awaiting plugin loop with slow/rejecting ownership: immediate requests and boot/background side effects remain blocked, no unhandled rejection.
- Actual installed Nitro/H3 routing: cached SSR, auth/setup, local fetch, normal API and background mutations cannot bypass starting/failed/recovery states.
- Two competing owned app processes: one successful writer, loser performs no boot/migration/media writes and cannot remove winner authority.
- Restore/uncertainty/corrupt/remote/partially published receipts: correct closed service with no takeover.
- Boot failure before/after provisioning: owned clients dispose safely; no ready state and no false clean receipt removal.
- Close during ownership/initialization; clean start/close/start; dev worker rebuild with process-level PID reuse; forced exit preserves recovery.
- Existing restore status capability, lease/drain, stale release and crash tests remain passing.

Use generated targets, owned temp roots, supported Node 22 and actual Nitro processes. Tests must not launch the configured application or reuse its `storage/` or `.env`. Report Windows versus Linux persistence evidence separately.

</details>
