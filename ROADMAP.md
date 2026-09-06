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
- [x] real GNU Arm Embedded Cortex-M3 fixture validating ELF + linker map + PC/LR + DWARF + source-prefix remap + source-context binding
- [x] Android tombstone frame BuildId extraction plus explicit `MODULE=ELF` symbol mapping with exact BuildId match required before fixed-argv addr2line/source binding
- [x] real Linux Android-format tombstone fixture using `cc -shared -g --build-id`, `readelf`, `nm`, `addr2line`, including BuildId mismatch/missing fail-closed negatives
- [x] Linux kernel Oops/RIP/call-trace raw-address retention plus deterministic `System.map` nearest-symbol resolution
- [x] KASLR-aware base-kernel symbolization with deterministic slide evidence, BigInt runtime->link normalization and `kaslr-unproven` fail-closed behavior
- [x] real-format non-zero-KASLR Oops/System.map fixture validating runtime/link address separation, exact symbol offsets, slide mismatch refusal and module-frame refusal
- [x] build-id-bound kernel module symbolization plus real relocatable `.ko` fixture validating exact BuildId/function+offset/source-context binding
- [x] bounded first-parent Safe Bisect with explicit historical-execution authority
- [x] fresh clone per historical candidate + isolated HOME/Git config + common credential-env scrubbing
- [x] deterministic classifier/security/context/verification/package/workflow governance gates
- [x] executable E2E for resume verification, Safe Bisect, native/embedded symbolization, patch authorization, apply/rollback and receipt-bound rollback lineage
- [x] reproducible development VSIX gate with exact VSCE 3.9.2 and two byte-identical packages
- [x] Safe Core Consumer CI Receipt plus development-only Consumer Evidence artifact, read-only permissions and no publication surface
- [x] Model Evaluation Record v1 with digest-bound corpus expectations, two-pass model/runtime/usage evidence and deterministic RCA/insufficient/false-fix metrics
- [x] manual read-only live synthetic model canary with protected-credential fail-closed behavior and `promotionEligible=false`
- [x] Promotion Corpus readiness floor: 12 reviewed cases, 3 repositories, 4 failure kinds and 3 insufficient-evidence negatives
- [x] real historical corpus expanded to 4 unique reviewed direct-parent transitions across Codex Debug, Safe Core and Codex Diagnose; current structural coverage is 4/12 cases, 3/3 repositories, 4/4 failure kinds and 0/3 insufficient-evidence negatives
- [x] duplicate historical transition/bad/fix identities are rejected so repeated fixes cannot inflate readiness
- [x] continuous read-only Promotion Provenance proves reviewed ref/direct-parent/ground-truth-file bindings without checkout or execution of historical code
- [x] promotion historical execution uses isolated HOME/Git/npm config and cannot inherit model/GitHub credentials
- [x] Promotion Corpus v2 insufficient-evidence variant contract: a real reviewed transition may attach one digest-bound `summary-only` evaluation variant with `assessment=insufficient`, `patchPolicy=forbidden`, no root-cause terms, no raw stdout/stderr/source/Git history/ground-truth leakage, while the 12-case floor still counts only unique reviewed transitions
- [x] package / package-lock / product-contract development identity is gated as one version (`0.1.5` for this line)
- [x] development-consumer Family lifecycle so unfinished Debug cannot block production Family freshness

## Required before active promotion

- [ ] add at least 8 more unique reviewed historical transitions to reach the 12-case floor
- [ ] add 3 authentic insufficient-evidence variants backed by real reviewed transitions and controller-enforced evidence projection
- [ ] recorded live-model RCA corpus with root-cause precision and insufficient-evidence metrics
- [ ] live-model false-fix and patch-applicability benchmark across real repositories
- [ ] live model token-usage calibration beyond deterministic context-byte baseline
- [ ] promotion corpus reaches its reviewed diversity floor and is explicitly switched to `promotionEligible=true`
- [ ] broader native/minidump, Cortex-M optimized/LTO, Android ABI/vendor and kernel module/architecture corpora
- [ ] explicit model behavioral canary where credentials are available
- [ ] Family promotion `development -> active`, repository governance/ruleset and immutable release workflow

## Later adapters

- minidump/Breakpad/Crashpad
- heap/profile/flamegraph evidence
- Sentry/GitHub Actions/GitLab CI acquisition adapters
- device transport adapters for Android/Linux/RTOS targets
- audio-pipeline diagnostic bundles for AEC/NS/VAD/KWS before/after evidence
- richer VS Code Evidence/Hypothesis tree views

Synthetic contract fixtures and synthetic live-canary artifacts are not promotion evidence. A reviewed historical harness or projection capability is also not a live quality result by itself. No promotion-grade live-model metric is claimed until the corpus is explicitly eligible and protected live records satisfy the evaluator gates.
