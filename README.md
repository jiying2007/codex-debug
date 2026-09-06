# Codex Debug Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Codex Debug Safe is the Codex Safe family product for **evidence-driven workspace debugging, causal verification, controlled repair, rollback, and observed fix verification**. It starts from a concrete failure and never treats model confidence as proof.

`codex-diagnose` remains the bounded, read-only CI/build/test diagnosis product. `codex-debug` owns the interactive workspace loop where reproduction, causal investigation, repair and post-change verification are explicitly separated.

## Development lifecycle

The current Product Contract is `lifecycle: development`. Debug is registered as a development Family consumer, so it inherits Safe Core identity/governance without participating in production Family freshness, snapshot or release readiness. Promotion to `active` is a future explicit contract change; this repository intentionally has no release workflow yet.

## First-version capability surface

- build/link and unit/integration test failures;
- native crashes, core dumps and bounded fixed-command GDB/LLDB backtraces;
- ASAN/TSAN/UBSAN/LSAN/Valgrind, race/deadlock/OOM/watchdog evidence;
- Linux kernel panic/Oops/call-trace, Android ANR/tombstone, Cortex-M fault-register and RTOS task/stack evidence;
- deterministic Cortex-M `PC/LR -> symbol` resolution from bounded linker maps and fixed-argv GNU/LLVM embedded `addr2line`; external firmware DWARF paths can be safely remapped into workspace source through bounded source-prefix mappings;
- Android tombstone `pc -> local ELF source` resolution only after exact tombstone/local-ELF BuildId match;
- Linux kernel RIP/call-trace `address -> System.map symbol+offset` evidence, with loadable-module frames left unresolved unless module-specific symbols are supplied in a future adapter;
- SARIF, JUnit, WAV acoustic metrics and Perfetto/Chrome trace summaries;
- Git HEAD/status/content-state fingerprint, bounded source windows, blame/history and causal commit candidates;
- Safe Core test-impact based regression-test candidates;
- two-pass model investigation: competing hypotheses followed by independent causal verification;
- bounded unified-diff proposals, inert by default;
- repeated reproduction/verification statistics and failure-transition classification;
- bounded **first-parent** Safe Bisect with a fresh isolated clone per candidate, only with explicit historical-execution authority;
- evidence-bound append-only sessions and self-digested Debug Receipt lineage;
- drift-safe patch snapshots and rollback;
- CLI and VS Code surfaces over the same engine.

## Authority model

```text
failure / artifact / core / firmware/platform symbols   UNTRUSTED DATA
                ↓
redact + bound + deterministic parse + identity checks + digest
                ↓
read-only source / Git / history evidence
                ↓
model hypothesis generation                    ADVISORY ONLY
                ↓
independent causal verifier                    ADVISORY ONLY
                ↓
verifier-accepted patch proposal               INERT
                ↓
explicit user authority
  ├─ execute reproduction command
  ├─ execute historical command for Safe Bisect
  ├─ apply checked patch
  ├─ roll back an unchanged recorded patch state
  └─ execute verification command
                ↓
observed before/after evidence + Debug Receipt
```

Logs, source text, commit subjects, debugger/symbolizer output, artifact summaries, filenames and platform dumps are data, never instructions. A model cannot execute commands, choose symbolizer argv, apply/rollback a patch, commit, push, merge, retry CI, publish a release or self-promote a hypothesis to `confirmed`.

## What `verified` means

A successful command alone is **not** a verified fix. `verified` requires:

1. an observed explicit reproduction failure;
2. a sufficiently reproducible baseline (`1/1` failure, or at least two repeated failures sharing one normalized failure signature);
3. an independently observed workspace content-state mutation after that baseline;
4. every bounded post-change verification run passes;
5. the stored session still validates its evidence, investigation, ledger, verification, patch-state and lineage digests.

A log plus an unrelated green test is `passed-unbound`, not `verified`. Runtime verification also records whether the failure transition is `resolved`, `same-failure`, `different-failure`, `mixed-failure`, or unbound.

**A verified fix does not by itself confirm a root-cause hypothesis.** `verified` proves the observed failure transition after a workspace mutation. A hypothesis can become `confirmed` only when it was already causally `supported` and the bound runtime verification then succeeds. Deterministic-only classification can therefore verify that a change resolved a failure without inventing a causal explanation.

## Development install

```bash
git clone --recurse-submodules https://github.com/jiying2007/codex-debug.git
cd codex-debug
npm ci --ignore-scripts --no-audit --no-fund
npm run ci
npm link
```

## CLI

Logs, reproduction and native core dumps:

```bash
codex-debug --log build.log
codex-debug --command "npm test" --repro-runs 3
codex-debug --core core.1234 --executable ./build/app --debugger auto
```

GDB runs with init loading, auto-load, history and debuginfod disabled. LLDB disables user init and symbol-file script loading. Debugger output is bounded before model context.

Cortex-M linker-map / ELF symbolization:

```bash
codex-debug \
  --log hardfault.log \
  --map build/firmware.map \
  --elf build/firmware.elf \
  --addr2line arm-none-eabi-addr2line \
  --source-prefix-map /ci/build/fw=.
```

Only controller-extracted `PC/LR` values from the fault evidence are passed to a fixed `addr2line -f -C -e ELF <addresses...>` template; the model cannot provide addresses, executables, tool names, source mappings or extra arguments. `--source-prefix-map` requires an absolute external prefix and a target that stays inside the workspace. The mapping changes path interpretation only; mapped source still passes realpath/symlink containment before it can enter source context.

Android tombstone local symbols:

```bash
codex-debug \
  --log tombstone.txt \
  --android-symbol libfoo.so=./symbols/libfoo.so
```

If a tombstone frame has `BuildId: ...`, Codex Debug Safe extracts the BuildId from the explicitly supplied local ELF with fixed `readelf -n`. Source/function resolution is allowed only when the two IDs match exactly. Missing tombstone BuildId, missing local BuildId and mismatch all fail closed for that frame and do not invoke `addr2line`.

Linux kernel `System.map` evidence:

```bash
codex-debug \
  --log kernel-oops.log \
  --kernel-system-map ./symbols/System.map
```

Kernel RIP/PC and call-trace addresses remain hexadecimal strings and are resolved deterministically to the nearest lower base-kernel symbol. Frames tagged with `[module]` are reported as `module-map-required`; the base `System.map` is never used to fake a module resolution.

Structured evidence:

```bash
codex-debug --log failure.log \
  --artifact sarif:reports/asan.sarif \
  --artifact junit:reports/junit.xml \
  --artifact perf:trace.json \
  --artifact wav:capture.wav
```

Safe Bisect requires both an exact user-entered command and explicit historical authority:

```bash
codex-debug \
  --command "npm test -- --runInBand" \
  --repro-runs 2 \
  --bisect-good v1.2.0 \
  --bisect-bad HEAD \
  --allow-historical-execution
```

Good must pass, bad must reproducibly fail, and mixed/flaky historical evidence fails closed. Every candidate runs in a fresh clone with isolated HOME/Git config and common credential-like environment variables removed. This is still not an OS sandbox. A proven `firstBad` proves only the supplied reproduction transition, not the precise faulty line/mechanism.

Resume after a manual edit:

```bash
codex-debug \
  --resume dbg-0123456789abcdef \
  --verify-command "npm test" \
  --verify-runs 5
```

Apply a persisted verifier-accepted patch and later roll it back:

```bash
codex-debug --apply-session dbg-0123456789abcdef
codex-debug --rollback-session dbg-fedcba9876543210
```

`--apply-session` first requires the current workspace content-state fingerprint to match the evidence-time state and rechecks that the persisted patch still has `supported + accept` causal-verifier authorization. It validates the patch, then writes a private bounded snapshot under `.codex-debug/snapshots/`. `--rollback-session` restores only recorded patch paths and **refuses** when any path has drifted after patch application, so later user edits are never overwritten.

`.codex-debug` is excluded from the workspace-code freshness fingerprint because it is product-private state; append-only session and snapshot files remain independently integrity-bound by their own digests.

## Patch policy

A patch is inert until explicit `--apply`, `--apply-session`, or the corresponding VS Code command. It must be textual, at most 256 KiB, repository-relative, free of traversal, reject binary/rename/copy patches, pass Git-native path parsing and `git apply --check --whitespace=error-all`, and avoid `.git`, `.codex-debug`, `src/codex-safe-core`, GitHub workflow/control-plane files, `.env`/key material, and generated/vendor/build/dependency outputs. Snapshot/rollback additionally rejects symlink/junction traversal, symlink/non-regular targets and hard-linked files.

Codex Debug Safe never commits, pushes, merges, opens PRs/MRs, retries pipelines or publishes releases.

## VS Code commands

- Debug Selected Failure Evidence
- Debug Failure Log File
- Debug Core Dump
- Debug Embedded Fault
- Debug Reproduction Command
- Run Safe Bisect
- Apply Last Proposed Patch
- **Rollback Last Applied Patch**
- Verify Last Fix
- Resume Debug Session and Verify
- Show Debug Session
- Check Debug Environment
- Show Debug Output

Workspace trust is mandatory. Historical execution and rollback/apply mutation surfaces require explicit user actions. Android/kernel symbol-file selection is currently exposed by the CLI engine; richer VS Code platform-symbol pickers remain development work rather than an implied capability.

## Token and evidence efficiency

Raw logs are not blindly sent to the model. Safe Core performs ANSI/credential cleanup, significant-window selection, duplicate folding and byte bounding. Debug adds only bounded parsed frames, platform/symbol summaries, source windows, deterministic artifact summaries, Git candidates, Safe Bisect metadata and regression-test candidates. Raw core dumps, ELF images, linker maps, System.map files, WAVs and trace files are never embedded directly. The deterministic CI benchmark currently enforces a compact/prompt-byte budget before any live-model token claim is made.

## Family relationship

```text
Codex Safe Core
├── Review Safe       change-risk judgment
├── Commit Safe       deterministic commit delivery
├── Change Safe       PR/MR delivery
├── Review Service    server-side review
├── Diagnose Safe     bounded read-only CI failure diagnosis
└── Debug Safe        workspace causal investigation + controlled repair + verification
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [ROADMAP.md](ROADMAP.md).

## License

MIT
