# Codex Debug Safe Roadmap

The first line is architecture-first. Marketplace publication is not the milestone; reproducible evidence, low false-fix rate and auditable authority boundaries are.

## Implemented in the development baseline

- [x] bounded/redacted failure evidence and deterministic failure taxonomy
- [x] two-pass hypothesis generation + independent causal verification
- [x] hypothesis ledger where the model cannot self-confirm
- [x] strict separation between `verified` fix and `confirmed` root-cause hypothesis
- [x] deterministic false-fix state-machine benchmark for weak baselines, missing mutation and failure replacement
- [x] executable fix-quality benchmark across six real temporary Git repositories: verified resolution, no-mutation green, weak baseline, same failure, replacement failure and mixed failures
- [x] executable quality gate with `falseVerified=0`, `regressionEscapes=0`, `failureReplacementEscapes=0`, weak-baseline refusal and no deterministic-only false confirmation
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
- [x] rollback operations persist as append-only child sessions with parent fingerprint, snapshot/path/digest/state-fingerprint lineage, patch-state rollback binding and a new Debug Receipt
- [x] executable rollback lineage E2E proving `proposed -> applied-unverified -> verified -> rollback child(proposed)`, duplicate-snapshot refusal, tamper detection and no false child on drift
- [x] GDB/LLDB fixed-command core symbolization with auto-load/network-symbol hardening and host-path redaction
- [x] real Linux native-core fixture (`cc -g` + GDB SIGSEGV + `generate-core-file`) validating `symbolizeCore()` against an actual core image
- [x] Cortex-M PC/LR -> bounded linker-map symbol/offset resolution
- [x] fixed-argv GNU/LLVM embedded addr2line ELF symbolization with safe `file:line` reuse in source/blame/history/test-impact
- [x] real host ELF+DWARF fixture (`cc -g` + `nm` + `addr2line`) validating function/source resolution and path redaction
- [x] bounded source-prefix remap from external firmware build roots into workspace-contained source, with redacted remap metadata
- [x] real GNU Arm Embedded Cortex-M3 fixture (`arm-none-eabi-as/ld/nm/addr2line`) validating ELF + linker map + PC/LR + DWARF + source-prefix remap + source-context binding
- [x] Android tombstone frame BuildId extraction plus explicit `MODULE=ELF` symbol mapping with exact BuildId match required before fixed-argv addr2line/source binding
- [x] real Linux Android-format tombstone fixture using `cc -shared -g --build-id`, `readelf`, `nm`, `addr2line`, including BuildId mismatch/missing fail-closed negatives
- [x] Linux kernel Oops/RIP/call-trace raw-address retention plus deterministic `System.map` nearest-symbol resolution
- [x] KASLR-aware base-kernel symbolization: parse deterministic `Kernel Offset`, accept explicit `--kernel-kaslr-slide`, require log/explicit agreement, normalize runtime -> link-time addresses with BigInt, and return `kaslr-unproven` when slide identity is unavailable
- [x] real-format non-zero-KASLR Oops/System.map fixture validating runtime/link address separation, exact symbol offsets, slide mismatch refusal and module-frame refusal
- [x] build-id-bound kernel module symbolization: parse `%pSb/%pBb`-style `[module build-id]`, require explicit `--kernel-module-symbol MODULE=ELF`, exact local ELF BuildId match, exact `nm` function lookup, then fixed host addr2line on `function+offset`
- [x] real relocatable `.ko` fixture (`cc -g -c` + `ld -r --build-id=sha1` + `readelf` + `nm` + `addr2line`) validating match, mismatch, missing-build-id fail-closed behavior and source-context binding
- [x] bounded first-parent Safe Bisect with explicit historical-execution authority
- [x] fresh clone per historical candidate + isolated HOME/Git config + common credential-env scrubbing
- [x] Safe Core test-impact regression-test candidates with symlink escape refusal
- [x] SARIF/JUnit/PCM16 WAV/Perfetto summaries
- [x] Cortex-M fault register, Android tombstone, kernel panic/Oops and RTOS signal parsers
- [x] deterministic classifier corpus and adversarial prompt/secret/patch/debugger gates
- [x] deterministic context-byte/compaction efficiency benchmark in CI
- [x] deterministic workflow action pin gate with non-zero coverage assertion
- [x] executable E2E for manual-edit resume verification, Safe Bisect, HardFault map symbolization, patch authorization, patch apply/rollback, receipt-bound rollback lineage and rollback-drift refusal
- [x] CLI surfaces for native, embedded, Android and kernel symbol evidence; VS Code embedded source-prefix remap, session resume, bisect, apply and receipt-bound rollback
- [x] package-content contract excluding tests, quality internals, workflows and `.codex-debug` private state
- [x] reproducible development VSIX gate: exact VSCE 3.9.2, normalized source mtimes, two independent packages required to have identical SHA-256
- [x] Safe Core Consumer CI Receipt binding exact CI source SHA, Core pin/digests, Node contract and completed suite lineage
- [x] development-only Consumer Evidence artifact containing VSIX, Receipt and checksums with read-only GitHub permissions and no publication surface
- [x] Model Evaluation Record v1 with digest-bound corpus expectations, self-digested records, two-pass model/runtime/usage evidence and deterministic RCA/insufficient/false-fix metrics
- [x] manual read-only live synthetic model canary with protected-credential fail-closed behavior, SHA-pinned actions, `promotionEligible=false` and no repository/publication authority
- [x] Promotion Corpus v1 readiness floor: at least 12 reviewed cases, 3 repositories, 4 failure kinds and 3 insufficient-evidence negatives before `promotionEligible=true` can validate
- [x] first real historical promotion case bound to persistent PR ref + exact bad/fix SHA + direct-parent fix + exact reproduction + digest-bound ground truth; controller must prove bad fails and fixed passes before model evaluation
- [x] real historical corpus expanded to 3 reviewed direct-parent transitions across Codex Debug and Safe Core, covering test, infra and governance failure kinds; current readiness is 3/12 cases, 2/3 repositories, 3/4 failure kinds and 0/3 insufficient-evidence negatives
- [x] duplicate historical transition/bad/fix identities are rejected so repeated fixes cannot inflate readiness
- [x] promotion historical execution uses isolated HOME/Git/npm config and an allowlisted environment so historical code cannot inherit model/GitHub credentials; model credentials stay in the separate Codex execution authority
- [x] package / package-lock / product-contract development identity is gated as one version (`0.1.3` for this line)
- [x] development-consumer Family lifecycle so unfinished Debug cannot block production Family freshness

## Required before active promotion

- [ ] recorded live-model RCA corpus with root-cause precision and insufficient-evidence negatives
- [ ] live-model false-fix and patch-applicability benchmark across real repositories
- [ ] live model token-usage calibration beyond deterministic context-byte baseline
- [ ] promotion corpus reaches its reviewed diversity floor and is explicitly switched to `promotionEligible=true`
- [ ] broader native core corpus beyond the deterministic Linux GDB fixture, including platform-specific minidump/core formats where applicable
- [ ] broader Cortex-M corpus across GCC/LLVM firmware layouts, optimized/LTO builds and vendor linker scripts
- [ ] broader Android bugreport/tombstone corpus across ABIs/APEX/vendor layouts and module sets
- [ ] broader kernel module/architecture corpus, including compressed modules, stripped/split debug info and additional KASLR layouts
- [ ] explicit model behavioral canary where credentials are available
- [ ] Family promotion `development -> active`, repository governance/ruleset and immutable release workflow

## Later adapters

- minidump/Breakpad/Crashpad
- heap/profile/flamegraph evidence
- Sentry/GitHub Actions/GitLab CI acquisition adapters
- device transport adapters for Android/Linux/RTOS targets
- audio-pipeline diagnostic bundles for AEC/NS/VAD/KWS before/after evidence
- richer VS Code Evidence/Hypothesis tree views

Synthetic contract fixtures and synthetic live-canary artifacts are not promotion evidence. A reviewed historical harness is also not a live quality result by itself. No promotion-grade live-model metric is claimed until the promotion corpus is explicitly eligible and protected live records satisfy the evaluator gates.
