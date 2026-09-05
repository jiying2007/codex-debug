# Architecture

## Product boundary

Codex Debug Safe owns interactive workspace failure investigation, explicit reproduction execution, platform/core/artifact evidence adaptation, hypothesis lifecycle, controlled patch validation/application, Safe Bisect orchestration, resumable verification and Debug Receipts. Safe Core owns runtime/provider/model routing, process safety primitives, log compaction/redaction, deterministic CI-style classification, test-impact ranking and Family governance primitives. Codex Diagnose Safe remains bounded and read-only.

Debug is currently a **development Family consumer**. Development consumers inherit identity and governance but are intentionally filtered from production Family freshness/snapshot/release readiness until an explicit `active` promotion.

## Pipeline

```text
Evidence source
  ├─ file / stdin / editor selection
  ├─ explicit reproduction command
  ├─ core + executable
  └─ SARIF / JUnit / WAV / perf / map / tombstone
              ↓
Evidence Engine
  ├─ byte bounds + Safe Core redaction/ANSI cleanup
  ├─ significant-window compaction
  ├─ failure taxonomy + platform parsers
  ├─ Cortex-M / Android / kernel / RTOS summaries
  ├─ fixed-command GDB/LLDB symbolization
  └─ content/evidence digests
              ↓
Read-only repository evidence
  ├─ Git HEAD + changed paths + content-state fingerprint
  ├─ bounded source windows
  ├─ blame/file history
  ├─ causal commit candidates
  └─ Safe Core test-impact candidates
              ↓
Phase 1: hypothesis generation
  ├─ competing hypotheses
  ├─ supporting/refuting evidence
  ├─ causal anchors
  └─ optional patch draft
              ↓
Phase 2: independent causal verification
  ├─ supported / insufficient / contradicted root-cause assessment
  ├─ hypothesis status updates
  └─ accept/reject patch disposition
              ↓
Explicit authority boundary
  ├─ apply checked patch
  ├─ run verification
  └─ optionally run historical code for Safe Bisect
              ↓
Observed before/after evidence
              ↓
Hypothesis confirmation + Debug Receipt + local session lineage
```

## Three independent authorities

1. **Evidence authority** — controller-observed data and deterministic parsers.
2. **Model advisory authority** — hypotheses, explanations, patch proposals and verification plans.
3. **User execution authority** — exact commands, historical execution and patch application.

Model output cannot create or inherit user execution authority.

## Causal semantics

A recent commit, blame line or high model confidence is never proof. They remain candidates. A second-pass verifier may mark a mechanism `supported`, but runtime fix verification remains a separate state.

Safe Bisect is also deliberately narrow: it validates a known-good endpoint, validates a reproducibly failing bad endpoint, then searches a bounded **first-parent path**. The result proves a failure transition for the supplied command. It does not prove an exact faulty line or causal mechanism. Mixed/flaky candidates stop the search as inconclusive.

## Verification semantics

- `unresolved`: no supported causal conclusion.
- `diagnosed`: investigation exists but is not a verified fix.
- `proposed`: a causal-verifier-accepted patch is available.
- `applied-unverified`: product-observed patch mutation exists without bound green verification.
- `verified`: observed reproducible failing baseline + observed workspace content mutation + every bounded post-change run passing.
- `regressed`: post-change verification fails after a mutation.

`passed-unbound` is intentionally not a fix status: it records a green command that cannot be causally bound to a prior observed failure/mutation.

## Workspace state and session lineage

Git context records HEAD plus a content-state fingerprint derived from changed tracked/untracked paths and their content hash/state. Verification compares this fingerprint with the baseline to establish that a mutation actually occurred; a model claim is irrelevant.

Sessions live under `<git-root>/.codex-debug/sessions/`. A stored session is revalidated against the receipt-bound evidence digest, investigation digest, ledger digest and verification digest before resume. A resumed session records parent session/fingerprint lineage. Local receipts are integrity bindings, not cryptographic signatures from a remote trust service.

## Debugger boundary

Core symbolization uses fixed argument templates only. GDB disables user/system init files where supported, auto-load and debuginfod; LLDB disables user init and symbol-file script loading. `DEBUGINFOD_URLS` is cleared. The model cannot append debugger commands. Output is byte bounded before model context.

## Artifact and platform adapters

Current deterministic adapters cover SARIF, JUnit, PCM16 WAV metrics, Chrome/Perfetto duration summaries, text/map/tombstone compaction, Cortex-M fault registers, Android tombstone identity/frames, Linux kernel panic/Oops call traces and basic RTOS task/stack/assert signals. Raw binary/large artifact bodies are not embedded in the model prompt.

## Safe Bisect boundary

Historical code execution is inherently higher risk. CLI requires both an exact `--command` and `--allow-historical-execution`; VS Code adds a modal confirmation. Execution occurs in an isolated temporary clone, which is cleaned between candidate checkouts. No model output can enable this path.

## Test selection

Debug reuses Safe Core `test-impact` to rank likely regression tests from changed/source paths and deterministic source references. These are evidence-backed **recommendations only**; they are not automatically executed and never confer `verified` state.

## Remaining architecture work before active promotion

The current baseline does not yet claim full minidump support, ELF/map-to-source symbolization for embedded firmware, deep Android bugreport parsing, full kernel symbol resolution, heap/profile adapters, provider-native GitHub/GitLab/Sentry acquisition, or a recorded model RCA benchmark. These remain promotion work rather than hidden assumptions.
