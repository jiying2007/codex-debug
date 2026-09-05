# Codex Debug Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Codex Debug Safe is the Codex Safe family product for **evidence-driven workspace debugging, causal verification, controlled repair, and observed fix verification**. It starts from a concrete failure and never treats model confidence as proof.

`codex-diagnose` remains the bounded, read-only CI/build/test diagnosis product. `codex-debug` owns the interactive workspace loop where reproduction, causal investigation, repair and post-change verification are explicitly separated.

## Development lifecycle

The current product contract is `lifecycle: development`. Codex Safe Core registers Debug as a development consumer, so it can inherit Family identity/governance without participating in production Family freshness, snapshot or release readiness. Promotion to `active` is a future explicit contract change; this repository intentionally has no release workflow yet.

## First-version capability surface

The first version is deliberately broad rather than a narrow demo:

- build/link and unit/integration test failures;
- native crashes, core dumps and bounded GDB/LLDB backtraces;
- ASAN/TSAN/UBSAN/LSAN/Valgrind, race/deadlock/OOM/watchdog evidence;
- Linux kernel panic/Oops/call-trace summaries;
- Android logcat/ANR/tombstone identity, signal and native-frame summaries;
- MCU Cortex-M HardFault/BusFault/UsageFault register decoding plus map/text evidence;
- RTOS task/stack/assert signals;
- dependency/infra and performance/latency evidence;
- WAV acoustic metrics, SARIF, JUnit and Perfetto/Chrome trace summaries;
- Git HEAD/status/content-state fingerprint, source snippets, blame/history and causal commit candidates;
- Safe Core test-impact based regression-test candidates;
- two-pass model investigation: hypothesis generation followed by independent causal verification;
- bounded unified-diff proposal, inert by default;
- explicit patch application only after deterministic validation;
- repeated reproduction and verification statistics;
- bounded first-parent Safe Bisect in an isolated temporary clone, only with explicit historical-execution authority;
- resumable, evidence-bound local sessions and Debug Receipt v1;
- CLI and VS Code surfaces over the same engine.

## Authority model

```text
failure / artifact / core dump                 UNTRUSTED DATA
                ↓
redact + bound + deterministic parse + digest
                ↓
read-only source / Git / history evidence
                ↓
model hypothesis generation                    ADVISORY ONLY
                ↓
independent causal verifier                     ADVISORY ONLY
                ↓
verifier-accepted patch proposal                INERT
                ↓
explicit user authority
  ├─ execute reproduction command
  ├─ execute historical command for Safe Bisect
  ├─ apply checked patch
  └─ execute verification command
                ↓
observed before/after evidence
                ↓
Debug Receipt
```

Logs, source text, commit subjects, debugger output, artifact summaries, filenames and platform dumps are data, never instructions. The model cannot execute commands, apply a patch, commit, push, merge, retry CI, publish a release or self-promote a hypothesis to `confirmed`.

## What `verified` means

A successful command alone is **not** a verified fix. `verified` requires all of the following:

1. a failure was observed through an explicit reproduction command;
2. the baseline was sufficiently reproducible (`1/1` failure, or at least two failures sharing one normalized failure signature for repeated runs);
3. the product independently observes a workspace content-state mutation after that baseline;
4. every bounded post-change verification run passes;
5. the resumed/stored session still validates against its evidence, investigation, ledger and verification receipt bindings.

A log file plus an unrelated green test is therefore `passed-unbound`, not `verified`.

## Install for development

```bash
git clone --recurse-submodules https://github.com/jiying2007/codex-debug.git
cd codex-debug
npm ci --ignore-scripts --no-audit --no-fund
npm run ci
npm link
```

## CLI examples

Log or piped evidence:

```bash
codex-debug --log build.log --markdown debug-report.md --output debug-session.json
adb logcat -d | codex-debug --kind android
codex-debug --log sanitizer.log --deterministic-only
```

Repeated reproduction:

```bash
codex-debug --command "npm test" --repro-runs 3
```

Core dump using only fixed debugger commands:

```bash
codex-debug \
  --core core.1234 \
  --executable ./build/app \
  --debugger auto
```

GDB is invoked with init-file loading, auto-load and debuginfod disabled; LLDB disables user init and symbol-file script loading. Debugger output is bounded before entering model context.

Attach structured artifacts:

```bash
codex-debug --log failure.log \
  --artifact sarif:reports/asan.sarif \
  --artifact junit:reports/junit.xml \
  --artifact perf:trace.json \
  --artifact wav:capture.wav
```

Safe Bisect deliberately requires two separate pieces of authority: an exact user-entered reproduction command and `--allow-historical-execution`.

```bash
codex-debug \
  --command "npm test -- --runInBand" \
  --repro-runs 2 \
  --bisect-good v1.2.0 \
  --bisect-bad HEAD \
  --allow-historical-execution
```

The implementation verifies the good endpoint passes and bad endpoint reproducibly fails, then binary-searches a bounded **first-parent** path in an isolated clone. Mixed/flaky evidence fails closed. A proven `firstBad` proves a failure transition for the supplied reproduction; it does not by itself prove the faulty line or mechanism.

Resume after a manual or externally produced edit:

```bash
codex-debug \
  --resume dbg-0123456789abcdef \
  --verify-command "npm test" \
  --verify-runs 5
```

Sessions are stored at the Git root under `.codex-debug/sessions/`, even when VS Code opens a repository subdirectory.

## Patch policy

A proposed patch is inert by default. `--apply` or the explicit VS Code apply command is required. Before application the patch must be textual, at most 256 KiB, repository-relative, free of path traversal and `.git` writes, avoid `src/codex-safe-core`, reject binary patches, and pass `git apply --check --whitespace=error-all`.

Codex Debug Safe never commits, pushes, merges, opens PRs/MRs, retries pipelines or publishes releases.

## Failure kinds

```text
build | test | crash | sanitizer | race | deadlock | oom | watchdog |
kernel | android | mcu | audio | performance | dependency | infra | unknown
```

`auto` uses deterministic classification before any model call. Failure-signature stability and reproduction sufficiency are tracked separately so a one-off flaky failure cannot become verified merely because later runs pass.

## VS Code commands

- **Debug Selected Failure Evidence**
- **Debug Failure Log File**
- **Debug Core Dump**
- **Debug Reproduction Command**
- **Run Safe Bisect**
- **Apply Last Proposed Patch**
- **Verify Last Fix**
- **Resume Debug Session and Verify**
- **Show Debug Session**
- **Check Debug Environment**
- **Show Debug Output**

Workspace trust is mandatory. Historical execution has an additional modal warning.

## Token and evidence efficiency

Raw logs are not blindly sent to the model. Safe Core performs ANSI/credential cleanup, significant-window selection, duplicate folding and byte bounding. Debug then adds bounded parsed frames, platform summaries, source windows, deterministic artifact summaries, Git candidates, Safe Bisect metadata and regression-test candidates. Raw core dumps, WAVs and trace files are never embedded directly into the model prompt.

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

Debug consumes an exact-pinned Safe Core runtime/provider/model-routing/diagnosis/test-impact surface. Debug-specific mutation and historical-execution authority remains product-owned.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [ROADMAP.md](ROADMAP.md).

## License

MIT
