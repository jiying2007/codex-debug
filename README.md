# Codex Debug Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Codex Debug Safe is the **evidence-driven debugging and fix-verification product** in the Codex Safe family. It starts from a concrete failure, builds bounded evidence, maintains an explicit hypothesis ledger, may propose a minimal textual patch, and only reports `verified` after an explicit verification command succeeds.

It is intentionally broader than Codex Diagnose Safe. Diagnose remains the bounded, read-only CI/build/test diagnosis product; Debug is the interactive workspace investigation/repair loop.

## First-version scope

The initial architecture is deliberately broad rather than a narrow demo:

- build/link failures;
- unit/integration test failures;
- native crashes and stack traces;
- ASAN/TSAN/UBSAN/LSAN/Valgrind evidence;
- Linux `dmesg`, panic/watchdog/lockup evidence;
- Android `logcat`, ANR/tombstone evidence;
- MCU HardFault/BusFault/UsageFault evidence;
- dependency/infra failures;
- performance/latency regression evidence;
- local logs, selected editor text, stdin, or an explicit reproduction command;
- Git HEAD/status/recent-history correlation;
- model-backed causal hypotheses with explicit supporting/refuting evidence;
- bounded unified-diff patch proposal;
- opt-in patch application after deterministic validation;
- explicit post-fix command verification;
- immutable evidence/ledger/verification fingerprints in Debug Receipt v1;
- CLI and VS Code surfaces over the same engine.

## Safety invariant

```text
failure evidence (untrusted)
       ↓
redact / bound / parse / fingerprint
       ↓
Git read-only context
       ↓
model investigation (no tool authority)
       ↓
hypothesis ledger + optional patch proposal
       ↓
                     explicit user authority only
                     ├─ --apply
                     ├─ --command
                     └─ --verify-command
                              ↓
                       deterministic verification
                              ↓
                         Debug Receipt
```

Logs, source paths, stack traces, commit subjects, test output, and repository text are data, never instructions. A model response cannot execute a command, apply a patch, commit, push, merge, or authorize network access.

`verified` is not a model verdict. It is produced only when the product observes the explicit verification command exit successfully.

## CLI

```bash
git clone --recurse-submodules https://github.com/jiying2007/codex-debug.git
cd codex-debug
npm ci --ignore-scripts --no-audit --no-fund
npm run ci
npm link
```

Investigate a log:

```bash
codex-debug --log build.log --markdown debug-report.md --output debug-session.json
```

Reproduce a failure, investigate it, apply a checked proposal, then rerun the same reproduction as verification:

```bash
codex-debug \
  --command "npm test" \
  --apply \
  --markdown debug-report.md
```

Use a distinct verification command:

```bash
codex-debug \
  --log crash.log \
  --verify-command "npm run test:regression"
```

Deterministic-only triage never invokes a model:

```bash
codex-debug --log sanitizer.log --deterministic-only
```

Pipe evidence:

```bash
adb logcat -d | codex-debug --kind android
```

## Failure kinds

```text
build | test | crash | sanitizer | kernel | android | mcu |
performance | dependency | infra | unknown
```

`auto` is the default and uses deterministic pattern classification before any model call.

## Hypothesis ledger

The model may return only `open`, `supported`, or `refuted`. It cannot declare its own hypothesis `confirmed`. Confirmation is promoted by deterministic verification evidence.

```text
H1 supported  reset/process lifetime race
H2 refuted    malformed input
H3 open       stale decoder state
        ↓
explicit patch / user edit
        ↓
reproduction passes
        ↓
H1 confirmed
```

## Patch policy

A proposed patch is inert by default. `--apply` is required to mutate the workspace. Before application the patch must:

- be textual and bounded to 256 KiB;
- contain repository-relative paths only;
- reject path traversal and `.git` writes;
- reject `src/codex-safe-core` mutation;
- reject binary patches;
- pass `git apply --check --whitespace=error-all`.

Codex Debug Safe never commits, pushes, opens a PR/MR, merges, retries CI, or publishes a release.

## VS Code

The extension contributes:

- **Debug Selected Failure Evidence**
- **Debug Failure Log File**
- **Debug Reproduction Command**
- **Apply Last Proposed Patch**
- **Verify Last Fix**
- **Check Debug Environment**
- **Show Debug Output**

Workspace trust is mandatory. Apply and verification remain separate explicit actions.

## Token efficiency

Raw logs are not dumped blindly into the model. Safe Core performs deterministic ANSI/secret cleanup, significant-error window selection, duplicate folding, and byte bounding first. Debug then adds only bounded parsed frames, signals, changed paths, and recent commit metadata. The default model budget is 80k estimated tokens, configurable independently from the raw evidence byte limit.

## Family relationship

```text
Codex Safe Core
├── Codex Review Safe       change-risk judgment
├── Codex Commit Safe       deterministic commit delivery
├── Codex Change Safe       PR/MR delivery
├── Codex Review Service    server-side review
├── Codex Diagnose Safe     bounded read-only CI failure diagnosis
└── Codex Debug Safe        interactive causal investigation + repair verification
```

Debug consumes the same exact-pinned Safe Core runtime/provider/model-routing/diagnosis primitives as the rest of the family. Debug-specific mutation authority remains product-owned and explicit.

## Development status

`0.1.0` is a development baseline, not a release claim. The repository is intentionally being built out before Marketplace publication. See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and [ROADMAP.md](ROADMAP.md).

## License

MIT
