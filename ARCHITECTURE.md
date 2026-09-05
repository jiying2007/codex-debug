# Architecture

## Product boundary

Codex Debug Safe owns interactive workspace failure investigation, explicit reproduction execution, hypothesis lifecycle, patch validation/application, and post-fix verification. Safe Core owns provider/runtime/model routing, process safety primitives, failure-log compaction, deterministic CI-style classification, and Family governance primitives. Codex Diagnose Safe continues to own bounded read-only local/GitLab CI diagnosis.

## Pipeline

```text
Evidence source
  ├─ file/stdin/editor selection
  └─ explicit reproduction command
          ↓
Evidence Engine
  ├─ raw byte bound
  ├─ Safe Core secret/ANSI cleanup
  ├─ significant-window compaction
  ├─ failure-kind parser
  ├─ stack/frame extraction
  └─ SHA-256 identity
          ↓
Read-only Git Context
  ├─ HEAD
  ├─ dirty state
  ├─ changed paths
  └─ recent commits
          ↓
Investigation Engine
  ├─ root-cause synthesis
  ├─ supported/refuted/open hypotheses
  ├─ causal anchors
  ├─ coverage gaps
  └─ optional bounded unified diff
          ↓
Hypothesis Ledger
          ↓
Explicit Authority Boundary
  ├─ apply patch? user only
  └─ execute verification? user only
          ↓
Verification Engine
          ↓
Debug Receipt + local session
```

## Authority model

There are three authorities and they never collapse into one:

1. **Evidence authority** — what was actually observed.
2. **Model advisory authority** — hypotheses, explanation, patch proposal, verification plan.
3. **User execution authority** — explicit command execution and patch application.

Model output cannot create user execution authority.

## Failure taxonomy

The product-level failure kind is intentionally broader than Safe Core's CI classification. `build`, `test`, `dependency`, and `infra` map naturally onto the Core prior. `crash`, `sanitizer`, `kernel`, `android`, `mcu`, and `performance` are Debug-owned evidence profiles.

## Verification semantics

`diagnosed` means the investigation produced a root-cause hypothesis. `proposed` means a patch exists and passed or failed preflight separately. `applied-unverified` means the user explicitly applied a patch but no successful verification was observed. `verified` requires an explicit verification command to exit successfully. `regressed` means a post-change verification command failed.

A model confidence score never upgrades the session to `verified`.

## Session storage

Sessions are stored under `.codex-debug/sessions/` with private file permissions where supported. They bind evidence, investigation, ledger and verification fingerprints. Raw source logs are not copied into the receipt; the bounded compact evidence is present in the local session for auditability.

## Planned adapters

The core engine is deliberately adapter-friendly. Follow-on work can add GDB/LLDB core dumps, SARIF, JUnit, GitHub Actions/GitLab CI artifacts, Android tombstones, perf traces, embedded register dumps, and audio/DSP diagnostic bundles without changing the authority model.
