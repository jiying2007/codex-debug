# Codex Debug Safe Roadmap

The first line is architecture-first. Marketplace publication is not the milestone; reproducible evidence, low false-fix rate and auditable authority boundaries are.

## Implemented in the development baseline

- [x] bounded/redacted failure evidence and deterministic failure taxonomy
- [x] two-pass hypothesis generation + independent causal verification
- [x] hypothesis ledger where the model cannot self-confirm
- [x] source windows, blame/history and causal commit candidates
- [x] repeated reproduction statistics and normalized failure signatures
- [x] workspace content-state mutation fingerprint
- [x] strict `verified` contract requiring failing baseline + mutation + green post-change runs
- [x] resumable receipt-bound sessions with lineage
- [x] inert unified-diff proposal + deterministic apply gates
- [x] GDB/LLDB fixed-command core symbolization with auto-load/network-symbol hardening
- [x] bounded first-parent Safe Bisect with explicit historical-execution authority
- [x] Safe Core test-impact regression-test candidates
- [x] SARIF/JUnit/PCM16 WAV/Perfetto summaries
- [x] Cortex-M fault register, Android tombstone, kernel panic/Oops and RTOS signal parsers
- [x] deterministic classifier corpus and adversarial prompt/secret/patch/debugger gates
- [x] CLI + VS Code command surfaces including core, bisect and session resume
- [x] development-consumer Family lifecycle so unfinished Debug cannot block production Family freshness

## Required before active promotion

- [ ] recorded model RCA corpus with root-cause precision and insufficient-evidence negatives
- [ ] false-fix and patch-applicability benchmark
- [ ] verified-fix rate and regression-escape metric on executable fixtures
- [ ] token/context-bytes-per-incident benchmark and baseline
- [ ] end-to-end real core fixture with matching symbols on supported host platforms
- [ ] stronger ELF/map/source symbolization for embedded firmware
- [ ] deep Android bugreport and Linux kernel symbol resolution fixtures
- [ ] rollback/snapshot evidence for patch application
- [ ] protected/generated/vendor path policy beyond current hard boundaries
- [ ] explicit model behavioral canary where credentials are available
- [ ] reproducible VSIX/package contract and Consumer CI Receipt
- [ ] Family promotion `development -> active`, repository governance/ruleset and immutable release workflow

## Later adapters

- minidump/Breakpad/Crashpad
- heap/profile/flamegraph evidence
- Sentry/GitHub Actions/GitLab CI acquisition adapters
- device transport adapters for Android/Linux/RTOS targets
- audio-pipeline diagnostic bundles for AEC/NS/VAD/KWS before/after evidence
- richer VS Code Evidence/Hypothesis tree views

No quality metric is claimed until the corresponding recorded corpus/evaluator exists.
