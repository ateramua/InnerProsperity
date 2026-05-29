# IntentFlow Backup Development Requirements

## 1) Scope

This document defines implementation requirements for IntentFlow backup and restore capabilities across desktop runtime, local/offline processing, and server-coordinated metadata workflows.

### In Scope

- End-to-end backup lifecycle: snapshot, chunking, delta updates, verification, storage, restore, rollback safety.
- User-facing and admin-facing backup UX in desktop application surfaces.
- Offline queueing and retry model for local, NAS, and supported cloud targets.
- Electron runtime responsibilities: IPC contracts, worker isolation, orchestration, and performance safeguards.
- Server-side responsibilities for authentication, metadata, queue processing, and transaction-safe restore.
- Feature flags, admin controls, and release gates.
- Documentation and verification requirements.

### Goals

- Ensure recoverability with verifiable integrity.
- Minimize restore point objective (RPO) using incremental backups.
- Keep backup/restore safe under crash, power loss, and partial connectivity.
- Keep user experience clear and reversible for destructive operations.
- Provide auditable metadata and deterministic behavior for troubleshooting.

### Out of Scope

- Full disaster-recovery orchestration for external systems unrelated to IntentFlow data contracts.
- New cloud provider integrations beyond approved provider list in this document.
- Cross-tenant migration tooling not directly tied to backup/restore workflows.

## 2) UI Entry Points And Access Behavior

### User Entry Points

- `Settings > Backup & Restore`: primary panel for setup, run, verify, restore.
- `Dashboard Recovery Widget`: shows latest backup status and restore readiness.
- `Startup Recovery Prompt`: appears when corruption or pending rollback is detected.

### Admin Entry Points

- `Admin > Backup Operations`: policy enforcement, queue controls, provider health, global throttle.
- `Admin > Feature Flags`: enable/disable capability flags per environment/cohort.
- `Admin > Security`: rotate keys, enforce encryption policy, inspect integrity incidents.

### Access Rules

- User role can configure personal backup target(s), run backup, simulate restore, and restore only to owned scope.
- Admin role can manage policy and observe organization-wide metadata but cannot bypass cryptographic checks.
- Restore actions require explicit confirmation and contextual warnings before execution.
- Rewind and rollback actions require additional confirmation and must display impact summary.

## 3) Client Backup Engine Requirements

The client engine MUST implement the following verbs and behavior:

- `backup`: produce point-in-time backup payload from durable app state.
- `restore`: restore from selected version using configured restore mode.
- `simulate`: dry-run validation for dependencies, permissions, integrity, and size.
- `compare`: diff two versions at metadata and logical content layers.
- `rewind`: restore a selected previous checkpoint while preserving recovery path.
- `queue`: enqueue operations when offline or unavailable targets prevent immediate execution.

### Engine Requirements

- Operations must be idempotent by operation id.
- All operations must emit progress states: `queued`, `running`, `paused`, `failed`, `completed`.
- Engine must persist resumable state in local durable storage.
- Engine must support cancellation and safe interruption handling.
- Engine must expose deterministic structured logs for every operation id.

## 4) Snapshot, Chunk, Delta, Compression, Encoding

### Snapshot Requirements

- Snapshot is a consistent read of all protected entities at one logical time boundary.
- Snapshot metadata must include schema version, app version, timestamp, source device id, and content hash.

### Chunking Requirements

- Large payloads must be chunked to bounded size (configurable policy).
- Chunk metadata must include index, size, hash, and parent snapshot id.

### Delta Requirements

- Delta backups must include base snapshot reference and ordered change-set.
- Delta replay must be deterministic and validated before commit.

### Compression Requirements

- Compression must be configurable per target/provider policy.
- Compression must happen before encryption for efficiency.
- Compression algorithm and level must be captured in metadata.

### Encoding Requirements

- Binary payload must use stable portable encoding for transport/storage.
- Metadata must be UTF-8 JSON with explicit schema versioning.
- Any encoding failures must fail operation pre-commit and surface actionable diagnostics.

## 5) Security And Integrity Requirements

### Encryption

- Backup payloads must be encrypted at rest and in transit where applicable.
- Encryption keys must never be persisted in plaintext.
- Key rotation must preserve ability to restore historical backups via versioned key references.

### HMAC / Integrity Verification

- Each chunk and manifest must carry integrity signature.
- Restore pipeline must verify integrity before any write to active store.
- Failed verification must hard-stop restore and transition to failure-safe state.

### Recovery Kit

- Recovery kit must include key references, seed material guidance, and restore prerequisites.
- Recovery kit creation and update must require explicit user acknowledgment.
- Recovery kit presence/health must be visible in UI and admin diagnostics.

## 6) Restore Modes And Rollback Safety

### Required Restore Modes

- `in-place`: overwrite active data set after successful preflight checks.
- `side-by-side`: restore into alternate location/database for verification before cutover.
- `point-in-time`: reconstruct specific snapshot plus deltas to target timestamp/checkpoint.

### Rollback Safety

- Restore must use transaction-safe staging and commit checkpoints.
- Pre-restore state must be preserved for rollback until post-restore validation passes.
- Automatic rollback must trigger on validation failure, write error, or integrity mismatch.
- Rollback events must be auditable and visible in operation history.

## 7) Offline Queue, NAS, And Cloud Provider Requirements

### Offline Queue

- Queue must persist across app restarts and process crashes.
- Queue must support exponential backoff with jitter and max-attempt policy.
- Queue must preserve operation ordering constraints where dependencies exist.

### NAS Targets

- Must validate mount availability, write permission, free space, and lock state before execution.
- Must support reconnect detection and automatic resume.

### Cloud Targets

- Provider adapters must implement unified interface for upload, verify, list versions, and download.
- Credential expiration must be detected and surfaced with re-auth flow.
- Provider-specific rate limits must feed queue backoff policy.

## 8) Electron IPC, Worker, And Runtime Requirements

### IPC Contract

- IPC channels must be explicit, versioned, and documented.
- Renderer must never perform privileged filesystem/network backup operations directly.
- IPC payloads must be schema-validated at boundary.

### Worker Model

- CPU- and IO-heavy backup work must run in worker process/thread, not main UI thread.
- Worker must support cooperative cancellation and checkpoint progress emission.
- Worker lifecycle must tolerate app minimize/restore and sleep/wake transitions.

### Runtime Safeguards

- Memory limits and chunk streaming must prevent large payload exhaustion.
- Watchdog must detect stalled operations and classify retryable vs terminal errors.

## 9) Server Auth, Routes, Metadata, Queue, Transaction Restore

### Auth

- Server APIs must require authenticated and authorized principals.
- Operation-scoped permissions must be enforced for backup metadata and restore actions.

### Routes

- Required route groups: backup manifest, chunk registration, version listing, compare, restore orchestration, queue status.
- Routes must be versioned and backward compatible during controlled migration windows.

### Metadata

- Metadata records must include tenant/user scope, operation id, version id, checksum summary, policy flags, and timestamps.
- Metadata writes must be atomic with operation state transitions.

### Queue / Orchestration

- Server queue must handle restore orchestration and long-running operations with resumable status.
- Queue must expose status endpoint and operation timeline for UI polling/subscription.

### Transaction-Safe Restore

- Restore execution must use staged writes and commit boundaries.
- Final cutover only after validation and post-write integrity checks succeed.

## 10) UX Behavior Requirements Per Panel / Action

### Backup Panel

- Show target status, last successful backup, next scheduled backup, and pending queue count.
- Disable run action when preflight checks fail and surface reasons inline.

### Restore Panel

- Display restore mode selector, version selector, and risk summary.
- Require explicit typed confirmation for destructive modes.

### Compare Panel

- Show differences in concise categories (added/removed/changed/error).
- Permit export of compare report for support/debug workflows.

### Queue Panel

- Show queue order, retries, next-attempt time, and error reason.
- Support pause/resume/cancel with role-gated permissions.

### Simulation Action

- Must provide preflight result without writing to active state.
- Must clearly indicate "no data changed" at completion.

## 11) Feature Flags And Admin Controls

- Backup system must be gateable via feature flags by environment and cohort.
- Critical features (restore, rewind, cloud uploads) must support independent toggles.
- Admin controls must include force-disable switch for incident response.
- Runtime must fetch and cache flags safely with offline fallback policy.

## 12) Documentation Requirements

Required documentation artifacts:

- End-user guide for setup, backup, simulate restore, restore modes.
- Admin runbook for flags, key rotation, queue triage, and incident response.
- API/IPC contract reference with examples.
- Failure-mode matrix and recovery playbook.
- Release verification checklist and rollback plan.

## 13) Testing, Build, And Smoke Verification

### Automated Testing

- Unit tests for chunking, delta replay, encryption/integrity checks, and queue policies.
- Integration tests for end-to-end backup/restore across supported providers.
- Contract tests for IPC schemas and server route payload compatibility.
- Regression tests for rollback safety and partial-failure recovery.

### Build Verification

- Backup modules must compile in all supported desktop build targets.
- Feature flags must not break startup when disabled.

### Smoke Verification

- Create backup, verify metadata, restore side-by-side, compare, and finalize cutover.
- Offline backup enqueue, reconnect, and successful completion.
- Intentional integrity failure should block restore and preserve active state.

## 14) Failure Handling Rules

- Every failure must be classified as retryable or terminal.
- Retryable failures must use bounded exponential retry with clear user/admin status.
- Terminal failures must include actionable remediation steps in UI and logs.
- No partial restore may be left active without explicit status and rollback state.
- Any cryptographic verification failure is terminal for that operation.

## 15) Release Acceptance Criteria

A release is accepted only when all criteria are met:

- All required tests pass in CI and local smoke plan passes.
- Backup/restore/rewind flows validated on representative datasets.
- Security checks (encryption + integrity verification) confirmed by test evidence.
- Offline queue behavior validated across restart and network transitions.
- Documentation artifacts are published and linked from docs index.
- Feature flags and admin controls verified in staging.
- No blocker or critical known issues remain open for backup capability.

## 16) File-By-File Implementation Reference Map

This map references current IntentFlow locations and expected implementation anchors for the backup capability.

### Existing Paths To Extend

- `src/main/index.cjs`: main-process orchestration bootstrap for backup runtime services.
- `src/preload/preload.cjs`: secure IPC bridge exposure for renderer backup actions.
- `src/services/fileEncryption.cjs`: encryption, key-handling, integrity helper expansion.
- `src/services/settingsService.cjs`: backup configuration persistence and policy settings.
- `src/pages/settings.jsx`: user-facing backup/restore settings entry point.
- `src/contexts/AuthContext.jsx`: role-based access gating for user/admin operations.
- `src/main/splash.cjs`: startup recovery checks and recovery prompt trigger path (if applicable).
- `src/db/database.cjs`: transactional restore boundaries and checkpoint integration.
- `src/db/migrations/`: metadata schema additions for backup versions, manifests, queue, restore logs.

### Candidate New Client Modules

- `src/services/backup/backupEngine.cjs`: top-level engine verbs (`backup`, `restore`, `simulate`, `compare`, `rewind`, `queue`).
- `src/services/backup/snapshotService.cjs`: consistent snapshot creation and manifest generation.
- `src/services/backup/chunkService.cjs`: chunking, checksums, reassembly.
- `src/services/backup/deltaService.cjs`: delta creation and replay.
- `src/services/backup/queueService.cjs`: durable offline queue and retry strategy.
- `src/services/backup/provider/localProvider.cjs`: local filesystem target adapter.
- `src/services/backup/provider/nasProvider.cjs`: NAS adapter and mount checks.
- `src/services/backup/provider/cloudProvider.cjs`: cloud adapter abstraction entry.
- `src/services/backup/restoreValidator.cjs`: preflight and post-restore validation.
- `src/services/backup/rollbackService.cjs`: rollback checkpointing and recovery logic.
- `src/services/backup/recoveryKitService.cjs`: recovery kit generation and validation.

### Candidate New UI Modules

- `src/components/backup/BackupPanel.jsx`: backup status and run actions.
- `src/components/backup/RestorePanel.jsx`: restore mode/version selection and confirmations.
- `src/components/backup/ComparePanel.jsx`: version diff viewer and export action.
- `src/components/backup/QueuePanel.jsx`: queue visibility and controls.
- `src/components/backup/SimulationPanel.jsx`: dry-run checks and result display.
- `src/components/admin/BackupOperationsPanel.jsx`: admin operations dashboard.
- `src/components/admin/BackupFeatureFlagsPanel.jsx`: feature toggles and policy controls.

### Candidate Electron Runtime Modules

- `src/main/backup/backupIpc.cjs`: IPC channel registration and schema enforcement.
- `src/main/backup/backupWorkerHost.cjs`: worker lifecycle and message routing.
- `src/main/backup/runtimeWatchdog.cjs`: stall detection and health diagnostics.

### Candidate Server Modules (If Shared Or Adjacent Service Exists)

- `server/routes/backup/*.ts`: manifest/chunk/version/compare routes.
- `server/routes/restore/*.ts`: restore orchestration and status routes.
- `server/services/backupQueue/*.ts`: asynchronous job orchestration.
- `server/services/restoreTransaction/*.ts`: staged transactional restore service.
- `server/migrations/*backup*`: metadata schema for backup and restore tracking.

### Documentation Paths

- `docs/README.md`: canonical navigation link for this requirements document.
- `docs/guides/`: user/admin runbooks and operational procedures.
- `docs/backup-development-requirements.md`: source of truth for implementation requirements.

---

All implementation tasks, code reviews, and release readiness checks for backup capability must satisfy this document unless superseded by a formally approved revision.
