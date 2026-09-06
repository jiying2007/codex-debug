# Architecture

## Product boundary

Codex Debug Safe owns interactive workspace failure investigation, explicit reproduction execution, platform/core/firmware/artifact evidence adaptation, hypothesis lifecycle, controlled patch validation/application/rollback, Safe Bisect orchestration, resumable verification and Debug Receipts. Safe Core owns runtime/provider/model routing, process-safety primitives, log compaction/redaction, deterministic CI-style classification, test-impact ranking and Family governance primitives. Codex Diagnose Safe remains bounded and read-only.

Debug is currently a **development Family consumer**. Development consumers inherit identity and governance but are filtered from production Family freshness/snapshot/release readiness until an explicit `active` promotion.

## Pipeline

```text
Evidence source
  ├─ file / stdin / editor selection
  ├─ explicit reproduction command
  ├─ native core + executable
  ├─ Cortex-M fault + linker map / ELF
  ├─ Android tombstone + matching BuildId ELF
  ├─ kernel Oops/panic + System.map + proven KASLR slide
  ├─ kernel module frame + logged BuildId + explicit local module ELF
  └─ SARIF / JUnit / WAV / perf / tombstone
              ↓
Evidence Engine
  ├─ byte bounds + Safe Core redaction/ANSI cleanup
  ├─ deterministic taxonomy/platform parsers
  ├─ fixed-command GDB/LLDB symbolization
  ├─ PC/LR -> map/ELF symbol + safe file:line source resolution
  ├─ Android BuildId check -> fixed addr2line only on exact identity
  ├─ base-kernel runtime address + proven KASLR slide -> link-time System.map evidence
  ├─ module log BuildId == local ELF BuildId -> exact nm symbol + logged offset -> addr2line
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

1. **Evidence authority** — controller-observed data and deterministic parsers/symbolizers.
2. **Model advisory authority** — hypotheses, explanations, patch proposals and verification plans.
3. **User execution authority** — exact commands, historical execution, patch apply and rollback actions.

Model output cannot create or inherit user execution authority. A local Receipt is an integrity binding, not an authorization token.

## Causal and verification semantics

A recent commit, blame line, symbolized address or high model confidence is never proof. A second-pass verifier may mark a mechanism `supported`, but runtime fix verification remains independent.

A successful before/after reproduction can prove that a workspace change resolves the observed failure while the root cause remains unconfirmed. Hypothesis state therefore follows `open/refuted/supported → confirmed`; only an already `supported` hypothesis may become `confirmed` after successful bound runtime verification.

Fix states are `unresolved`, `diagnosed`, `proposed`, `applied-unverified`, `verified`, and `regressed`. `verified` requires an observed reproducible failing baseline, an independently observed workspace mutation, and every bounded post-change run passing. `passed-unbound` is not a fix status. Runtime verification separately records `resolved`, `same-failure`, `different-failure`, `mixed-failure`, or `unbound` failure transition.

Rollback is an operation, not another fix state. When an applied or verified patch is successfully rolled back, the new child session returns to `proposed`: the causal patch proposal remains known, but the current workspace no longer contains the applied fix. A rollback child is therefore forbidden from retaining `verified` or `applied-unverified`.

Safe Bisect is deliberately narrow: it proves a failure transition across a bounded **first-parent** path for one explicit reproduction command. It does not prove an exact faulty line or mechanism.

## Workspace freshness and patch transaction

Git context uses `git status --porcelain=v1 -z` so spaces, Unicode and rename records are interpreted without C-style quoting ambiguity. The state fingerprint binds HEAD plus changed path identities/content. Product-private `.codex-debug` state is excluded from this user-code observation domain.

A persisted model patch cannot be applied when the current state fingerprint differs from the evidence-time fingerprint. Patch paths are parsed with Git-native `git apply --numstat -z`; rename/copy patches are currently rejected so rollback has an exact bounded path set. Control-plane, secret, generated, dependency, vendor and build-output paths fail closed for model application.

Patch application is a transaction:

```text
Git-native path parse
  ↓
deterministic protected-path checks
  ↓
git apply --check
  ↓
regular-file / symlink-parent / hardlink checks
  ↓
bounded private before snapshot
  ↓
git apply
  ↓
record exact post-state identity
```

## Receipt-bound rollback operation

Rollback first verifies **all** targets still match the snapshot's recorded post-patch identity. Any user drift causes refusal before restoration, and no rollback child session is written. Restore bytes are staged privately before mutation. Filesystem races that still produce a partial restore are surfaced explicitly rather than hidden.

A successful rollback is then persisted as a new append-only child session rather than returned as an unrecorded transient result. The child binds:

```text
parent session id + parent Debug fingerprint
  ↓
exact snapshot id + restored paths
  ↓
rollback digest
  ↓
workspace state fingerprint before rollback
  ↓
workspace state fingerprint after rollback
  ↓
patch state: applied=false, rolledBack=true
  ↓
verification-side rollback observation
  ↓
lineage / patch-state / verification digests
  ↓
new Debug Receipt + new random session id
```

The complete operation object lives under `lineage.rollback`, so it is covered by the existing Receipt `lineageDigest`; equivalent rollback facts are cross-bound through `patchStateDigest` and `verificationDigest`. Stored-session validation checks those three domains agree. Reusing a rollback child as another rollback source is rejected with `EROLLBACKCONSUMED`. The restored child may later be used as a fresh proposal source for a new apply transaction, which creates a new snapshot rather than consuming the old rollback again.

## Session and Debug Receipt lineage

Sessions live under `<git-root>/.codex-debug/sessions/` and are append-only. Session IDs include random entropy; duplicate IDs are never silently overwritten. Session directories/files reject symlink/junction/hardlink aliasing.

A Debug Receipt binds evidence, investigation, hypothesis ledger, verification, patch state and parent lineage and self-digests its metadata. Resume, apply and rollback operations create child sessions with `parentSessionId` and `parentDebugFingerprint`; they do not mutate the parent. Local digests detect stale/accidental mutation but are not remote signatures. Persisted patches remain apply-eligible only when deterministic business rules still show `rootCauseAssessment=supported` and `patchDisposition=accept`.

## Debugger and embedded symbol boundaries

Core symbolization uses fixed argument templates only. GDB disables init files, auto-load, debuginfod and history persistence; LLDB disables user init and symbol-file script loading. The model cannot append debugger commands. Output is byte bounded before model context.

Cortex-M fault parsing exposes only controller-observed `PC/LR` addresses. A bounded linker-map parser resolves nearest symbol + offset. Explicit ELF symbolization uses only fixed allowlisted `addr2line -f -C -e ELF <PC/LR...>` invocation. `--source-prefix-map OLD=TARGET` may reinterpret external build paths only when OLD is absolute and TARGET stays inside the workspace; it never grants source-read authority. Accepted `file:line` values reuse the workspace-contained source/blame/history/test-impact pipeline.

## Android symbol boundary

Android tombstone frames may be paired with explicit local symbol ELFs using `--android-symbol MODULE=ELF`. A frame reaches source resolution only when the tombstone BuildId exists and exactly matches a BuildId extracted from the local ELF by fixed `readelf -n`. Missing/mismatched identity leaves the frame unresolved and does not invoke addr2line.

After identity success, the frame PC is passed through fixed `addr2line -f -C -e ELF <pc>`. Resulting `file:line` remains untrusted and enters source/Git/test-impact only through workspace containment. Retained evidence stores local ELF basename, size and SHA-256 digest rather than its absolute host path.

## Kernel symbol boundary: two independent identity domains

Kernel symbol evidence intentionally separates **base-kernel identity** from **loadable-module identity**. Neither proof can substitute for the other.

### Base kernel: System.map + proven KASLR slide

Kernel RIP/PC and call-trace addresses are retained as hexadecimal strings so 64-bit addresses never round through JavaScript `Number`. `System.map` is a link-time map while Oops addresses may be KASLR-shifted runtime addresses.

The controller resolves a base-kernel symbol only after the KASLR slide is proven. Proof may come from deterministic `Kernel Offset: 0x... from 0x...` evidence or explicit `--kernel-kaslr-slide 0xHEX`. If both exist they must match exactly or the operation fails with `EKASLRMISMATCH`. Runtime addresses are normalized with `BigInt` subtraction and evidence retains `runtimeAddress`, `linkAddress`, `slide` and `slideSource` separately. Without proof, base-kernel frames are `kaslr-unproven` and no nearest-symbol lookup occurs. A known-disabled KASLR configuration still requires explicit `0x0` unless the log proves zero.

### Loadable modules: logged BuildId + explicit local ELF

A loadable-module frame is never resolved through base-kernel `System.map`. Legacy tags such as `foo+0x10/0x20 [vendor_mod]` remain unresolved and are reported as `module-build-id-required` when a local module ELF is supplied, or `module-map-required` when no module symbol mapping exists.

Identity-bearing kernel `%pSb/%pBb`-style tags such as `foo+0x10/0x20 [vendor_mod <build-id>]` may be paired with repeatable `--kernel-module-symbol MODULE=ELF` mappings. Resolution is allowed only through this fail-closed chain:

```text
logged module + logged BuildId
  ↓
explicit MODULE=ELF mapping
  ↓
fixed readelf -n extracts local ELF BuildId
  ↓
exact BuildId equality
  ↓
fixed host nm finds the exact logged function symbol
  ↓
local relocatable symbol address + logged function offset
  ↓
fixed host addr2line
  ↓
workspace-contained file:line
```

Missing logged BuildId is `module-build-id-required`; mismatched identity is `module-build-id-mismatch`; missing local mapping is `module-symbol-file-missing`; an exact function miss is not replaced with a nearest-symbol guess. Only `buildIdMatch=true` and `status=resolved` module locations can enter source snippets, blame/history, causal candidates or test-impact. Retained module metadata contains basename/size/SHA-256 identity, not an absolute host path.

A real Linux CI fixture builds an actual relocatable `.ko`-style ELF with `cc -g -c` and `ld -r --build-id=sha1`, then proves the production path `readelf → nm → function+offset → addr2line → workspace source`. The same fixture requires mismatch and missing-build-id cases to remain unresolved.

## Safe Bisect boundary

Historical code execution is higher risk. CLI requires both an exact `--command` and `--allow-historical-execution`; VS Code adds a modal confirmation. Every tested commit receives a **fresh temporary clone**, isolated HOME/global Git config, and common credential-like environment variables plus SSH agent state are stripped before the historical command runs. This is **not an OS sandbox**.

## Artifact/platform adapters and test selection

Current deterministic adapters cover SARIF, JUnit, PCM16 WAV metrics, Chrome/Perfetto duration summaries, Cortex-M fault registers + map/ELF symbols, Android BuildId-bound local ELF symbols, KASLR-aware Linux base-kernel System.map symbols, BuildId-bound loadable-module ELF source symbols, and basic RTOS task/stack/assert signals. Raw large/binary artifacts are not embedded directly in model prompts.

Debug reuses Safe Core `test-impact` to rank regression-test candidates. Recommendations are not automatically executed and never confer `verified` state.

## Development Consumer Evidence pipeline

The CI has a separate Consumer Evidence job that runs only after the full OS/Node matrix and security job succeed:

```text
validated CI source SHA
  ↓
normalize package-input mtimes to commit epoch
  ↓
VSCE 3.9.2 package A + package B
  ↓
require SHA256(A) == SHA256(B)
  ↓
inspect VSIX runtime/private-surface contract
  ↓
Safe Core Consumer CI Receipt
  ├─ exact CI source SHA
  ├─ Core gitlink + version + runtime/governance digests
  ├─ Node support contract
  └─ completed suite lineage, including kernel-kaslr, kernel-module-buildid and rollback-receipt-lineage
  ↓
SHA256SUMS
  ↓
short-retention GitHub Actions artifact
```

The job uses read-only GitHub permissions and is part of the top-level CI Gate. It does not tag, publish, attest as a formal release, or upload to Marketplace/GitHub Releases. This establishes development package/receipt evidence while keeping `lifecycle=development` outside the production Family release path.

## Remaining architecture work before active promotion

The development baseline still does not claim full minidump/Crashpad support, broad optimized/LTO/vendor firmware coverage, broad Android bugreport/APEX/vendor symbol layouts, broad compressed/stripped/split-debug kernel module corpora across architectures, heap/profile adapters, provider-native GitHub/GitLab/Sentry acquisition, OS-sandboxed historical execution, or a production recorded live-model RCA benchmark. Final Family governance/ruleset and immutable release chain remain explicit promotion work.
