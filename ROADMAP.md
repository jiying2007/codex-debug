# Codex Debug Safe Roadmap

The first line is architecture-first. Marketplace publication is not the milestone; reproducible evidence, low false-fix rate and auditable authority boundaries are.

## Implemented in the development baseline

- [x] bounded/redacted failure evidence and deterministic failure taxonomy
- [x] two-pass hypothesis generation + independent causal verification
- [x] hypothesis ledger where the model cannot self-confirm
- [x] strict separation between `verified` fix and `confirmed` root-cause hypothesis
- [x] deterministic false-fix state-machine benchmark for weak baselines, missing mutation and failure replacement
- [x] source windows, blame/history and causal commit candidates with symlink/junction escape refusal
- [x] repeated reproduction statistics, normalized failure signatures and failure-transition classification
- [x] workspace freshness fingerprint with NUL-delimited Git status parsing and product-private `.codex-debug` exclusion
- [x] strict `verified` contract requiring reproducible failing baseline + mutation + green post-change runs
- [x] append-only receipt-bound sessions with random session entropy and parent lineage
- [x] self-digested Debug Receipt binding evidence/investigation/ledger/verification/patch state/lineage
- [x] inert unified-diff proposal + Git-native path parsing + deterministic stale-workspace/apply gates
- [x] persisted patch re-authorization requiring supported causal verification, covered at the real apply entrypoint
- [x] protected control-plane/secret/generated/vendor patch paths fail closed by default
- [x] bounded private patch snapshots + drift-safe rollback + symlink/junction/hardlink rejection
- [x] GDB/LLDB fixed-command core symbolization with auto-load/network-symbol hardening and host-path redaction
- [x] real Linux native-core fixture (`cc -g` + GDB SIGSEGV + `generate-core-file`) validating `symbolizeCore()` against an actual core image
- [x] Cortex-M PC/LR -> bounded linker-map symbol/offset resolution
- [x] fixed-argv GNU/LLVM embedded addr2line ELF symbolization with safe `file:line` reuse in source/blame/history/test-impact
- [x] real Linux ELF+DWARF fixture (`cc -g` + `nm` + `addr2line`) validating function/source resolution and path redaction
- [x] bounded first-parent Safe Bisect with explicit historical-execution authority
- [x] fresh clone per historical candidate + isolated HOME/Git config + common credential-env scrubbing
- [x] Safe Core test-impact regression-test candidates with symlink escape refusal
- [x] SARIF/JUnit/PCM16 WAV/Perfetto summaries
- [x] Cortex-M fault register, Android tombstone, kernel panic/Oops and RTOS signal parsers
- [x] deterministic classifier corpus and adversarial prompt/secret/patch/debugger gates
- [x] deterministic context-byte/compaction efficiency benchmark in CI
- [x] deterministic workflow action pin gate with non-zero coverage assertion
- [x] executable E2E for manual-edit resume verification, Safe Bisect, HardFault map symbolization, patch authorization, patch apply/rollback and rollback-drift refusal
- [x] CLI + VS Code command surfaces including core, embedded fault, bisect, session resume, persisted apply and rollback
- [x] package-content contract excluding tests, quality internals, workflows and `.codex-debug` private state
- [x] development-consumer Family lifecycle so unfinished Debug cannot block production Family freshness

## Required before active promotion

- [ ] recorded live-model RCA corpus with root-cause precision and insufficient-evidence negatives
- [ ] live-model false-fix and patch-applicability benchmark across real repositories
- [ ] verified-fix rate and regression-escape metric on broader executable fixtures
- [ ] live model token-usage calibration beyond deterministic context-byte baseline
- [ ] broader native core corpus beyond the deterministic Linux GDB fixture, including platform-specific minidump/core formats where applicable
- [ ] real cross-toolchain Cortex-M ELF fixture + source-prefix remapping for external build roots
- [ ] deep Android bugreport and Linux kernel symbol resolution fixtures
- [ ] explicit model behavioral canary where credentials are available
- [ ] reproducible VSIX build plus Consumer CI Receipt
- [ ] Family promotion `development -> active`, repository governance/ruleset and immutable release workflow

## Later adapters

- minidump/Breakpad/Crashpad
- heap/profile/flamegraph evidence
- Sentry/GitHub Actions/GitLab CI acquisition adapters
- device transport adapters for Android/Linux/RTOS targets
- audio-pipeline diagnostic bundles for AEC/NS/VAD/KWS before/after evidence
- richer VS Code Evidence/Hypothesis tree views

No live-model quality metric is claimed until the corresponding recorded corpus/evaluator exists.
