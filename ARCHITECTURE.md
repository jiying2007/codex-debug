# Architecture

## Product boundary

Codex Debug Safe owns interactive workspace failure investigation, explicit reproduction execution, platform/core/artifact evidence adaptation, hypothesis lifecycle, controlled patch validation/application/rollback, Safe Bisect orchestration, resumable verification and Debug Receipts. Safe Core owns runtime/provider/model routing, process safety primitives, log compaction/redaction, deterministic CI-style classification, test-impact ranking and Family governance primitives. Codex Diagnose Safe remains bounded and read-only.

Debug is currently a **development Family consumer**. Development consumers inherit identity and governance but are filtered from production Family freshness/snapshot/release readiness until an explicit `active` promotion.

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
  ├─ deterministic taxonomy/platform parsers
  ├─ fixed-command GDB/LLDB symbolization
  ├─ source/Git/test-impact context
  └─ content/evidence digests
              ↓
Phase 1: competing hypothesis generation
              ↓
Phase 2: independent causal verification
  ├─ supported / insufficient / contradicted
  └─ accept / reject / none patch disposition
              ↓
Explicit user authority boundary
  ├─ run reproduction
  ├─ run isolated historical candidates
  ├─ apply checked + snapshotted patch
  ├─ rollback unchanged recorded patch state
  └─ run post-change verification
              ↓
Observed before/after evidence
              ↓
Fix verdict + optional hypothesis confirmation
              ↓
Append-only session lineage + self-digested Debug Receipt
```

## Three independent authorities

1. **Evidence authority** — controller-observed data and deterministic parsers.
2. **Model advisory authority** — hypotheses, explanations, patch proposals and verification plans.
3. **User execution authority** — exact commands, historical execution, patch apply and rollback actions.

Model output cannot create or inherit user execution authority. A local Receipt is an integrity binding, not an authorization token.

## Causal semantics

A recent commit, blame line or high model confidence is never proof. A second-pass verifier may mark a mechanism `supported`, but runtime fix verification remains independent.

A successful before/after reproduction can prove that a workspace change resolves the observed failure while the root cause remains unconfirmed. Hypothesis state therefore follows `open/refuted/supported → confirmed`; only an already `supported` hypothesis may become `confirmed` after successful bound runtime verification.

Safe Bisect is deliberately narrow: it proves a failure transition across a bounded **first-parent path** for one explicit reproduction command. It does not prove an exact faulty line or mechanism.

## Verification semantics

- `unresolved`: no supported causal conclusion.
- `diagnosed`: investigation exists but is not a verified fix.
- `proposed`: a causal-verifier-accepted patch is available.
- `applied-unverified`: product-observed patch mutation exists without bound green verification.
- `verified`: observed reproducible failing baseline + observed workspace content mutation + every bounded post-change run passing.
- `regressed`: post-change verification fails after a mutation.

`passed-unbound` is not a fix status. Runtime verification also records `resolved`, `same-failure`, `different-failure`, `mixed-failure`, or `unbound` transition state.

## Workspace freshness

Git context uses `git status --porcelain=v1 -z` so spaces, Unicode and rename records are interpreted without C-style quoting ambiguity. The state fingerprint binds HEAD plus changed path identities/content. Product-private `.codex-debug` state is excluded from this user-code observation domain.

A persisted model patch cannot be applied when the current state fingerprint differs from the evidence-time fingerprint. Patch paths are parsed with Git-native `git apply --numstat -z`; rename/copy patches are currently rejected so rollback has an exact bounded path set.

## Patch transaction and rollback

Patch application is a transaction around validated paths:

```text
Git-native path parse
  ↓
deterministic protected-path checks
  ↓
git apply --check
  ↓
regular-file/symlink-parent/hardlink checks
  ↓
bounded private before snapshot
  ↓
git apply
  ↓
record exact post-state identity
```

Rollback first verifies **all** targets still match the recorded post-state, then stages restore bytes privately before modifying the workspace. Any user drift causes refusal. Filesystem races can still cause a partial restore; that state is explicitly reported rather than hidden.

## Session and Receipt lineage

Sessions live under `<git-root>/.codex-debug/sessions/` and are append-only. Session IDs include random entropy; a duplicate ID is never silently overwritten. Session directories/files reject symlink/junction/hardlink aliasing.

A Debug Receipt binds evidence, investigation, hypothesis ledger, verification, patch state and parent lineage. It also contains a self-digest covering metadata such as model/codex version and timestamp. Resume/apply operations create child sessions with `parentSessionId` and `parentDebugFingerprint`; they do not mutate the parent session.

These local digests detect stale/accidental mutation but are not a remote cryptographic signature. Deterministic business rules are rechecked separately: a persisted patch remains apply-eligible only when its investigation records `rootCauseAssessment=supported` and `patchDisposition=accept`.

## Debugger boundary

Core symbolization uses fixed argument templates only. GDB disables init files, auto-load, debuginfod and history persistence; LLDB disables user init and symbol-file script loading. The model cannot append debugger commands. Output is byte bounded before model context.

## Safe Bisect boundary

Historical code execution is higher risk. CLI requires both an exact `--command` and `--allow-historical-execution`; VS Code adds a modal confirmation. Every tested commit receives a fresh temporary clone and isolated HOME/global Git config. Common credential-like environment variables and SSH agent state are stripped before the historical command runs. This improves isolation between candidates but is **not an OS sandbox**.

## Artifact/platform adapters and test selection

Current deterministic adapters cover SARIF, JUnit, PCM16 WAV metrics, Chrome/Perfetto duration summaries, text/map/tombstone compaction, Cortex-M fault registers, Android tombstone identity/frames, Linux kernel panic/Oops call traces and basic RTOS task/stack/assert signals. Raw large/binary artifacts are not embedded directly in model prompts.

Debug reuses Safe Core `test-impact` to rank regression-test candidates. Recommendations are not automatically executed and never confer `verified` state.

## Remaining architecture work before active promotion

The development baseline still does not claim full minidump/Crashpad support, production ELF/map-to-source symbolization, deep Android bugreport parsing, full kernel symbol resolution, heap/profile adapters, provider-native GitHub/GitLab/Sentry acquisition, OS-sandboxed historical execution, or a production recorded model RCA benchmark. These are explicit promotion work, not hidden assumptions.
