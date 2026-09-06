# Codex Debug Safe Roadmap

The first line is architecture-first. Marketplace publication is not the milestone; reproducible evidence, low false-fix rate and auditable authority boundaries are.

## Implemented in the development baseline

- [x] bounded/redacted failure evidence and deterministic failure taxonomy
- [x] two-pass hypothesis generation + independent causal verification
- [x] hypothesis ledger where the model cannot self-confirm
- [x] strict separation between `verified` fix and `confirmed` root-cause hypothesis
- [x] deterministic and executable false-fix/regression-escape quality gates
- [x] source windows, blame/history, causal commit candidates and workspace freshness with symlink/junction escape refusal
- [x] append-only self-digested Debug Receipts and receipt-bound sessions/rollback lineage
- [x] protected patch surfaces, stale-workspace apply gates, private snapshots and drift-safe rollback
- [x] GDB/LLDB real native-core fixture, Cortex-M map/ELF symbolization and real GNU Arm Embedded fixture
- [x] Android BuildId-bound ELF symbolization, non-zero-KASLR `System.map` resolution and BuildId-bound relocatable kernel-module symbolization
- [x] bounded first-parent Safe Bisect with explicit historical-execution authority, isolated HOME/Git config and credential scrubbing
- [x] deterministic security/context/verification/package/workflow governance gates
- [x] reproducible development VSIX gate with exact VSCE 3.9.2 and byte-identical dual packaging
- [x] Safe Core Consumer CI Receipt plus read-only development Consumer Evidence artifact
- [x] Model Evaluation Record v1 with digest-bound corpus expectations, two-pass model/runtime/usage evidence and deterministic RCA/insufficient/false-fix metrics
- [x] manual read-only live synthetic model canary with protected-credential fail-closed behavior and `promotionEligible=false`
- [x] Promotion Corpus readiness floor: 12 unique reviewed cases, 3 repositories, 4 failure kinds and 3 authentic insufficient-evidence variants
- [x] real historical corpus with 8 unique reviewed direct-parent transitions across Codex Debug, Safe Core, Codex Diagnose and Codex Change; repository and failure-kind floors are met
- [x] duplicate historical transition/bad/fix identities are rejected so repeated fixes cannot inflate readiness
- [x] continuous read-only Promotion Provenance proves reviewed ref/direct-parent/ground-truth-file bindings without checkout or execution of historical code
- [x] promotion historical execution uses isolated HOME/Git/npm config and cannot inherit model/GitHub credentials
- [x] Promotion Corpus v2 insufficient-evidence variant contract: one real reviewed transition may attach one digest-bound `summary-only` evaluation variant with `assessment=insufficient`, `patchPolicy=forbidden`, no root-cause terms, no raw stdout/stderr/source/Git-history/ground-truth leakage, while the 12-case floor still counts only unique reviewed transitions
- [x] three authentic insufficient-evidence variants are attached to reviewed Debug, Safe Core and Diagnose transitions; structural coverage is now `8/12` reviewed cases, `4/3` repositories, `4/4` failure kinds, `3/3` insufficient variants and `11` model-evaluation views
- [x] Promotion Provenance continues to prove exactly 8 historical transitions; insufficient variants never inflate provenance or qualification transition counts
- [x] package / package-lock / product-contract development identity is gated as one version (`0.1.8` for this line)
- [x] development-consumer Family lifecycle so unfinished Debug cannot block production Family freshness

## Required before active promotion

- [ ] add at least 4 more unique reviewed historical transitions to reach the 12-case floor
- [ ] recorded credential-backed live-model RCA corpus with root-cause precision and insufficient-evidence metrics
- [ ] live-model false-fix and patch-applicability benchmark across real repositories
- [ ] live model token-usage calibration beyond deterministic context-byte baseline
- [ ] promotion corpus reaches its unique reviewed-case floor and is explicitly switched to `promotionEligible=true`
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

Synthetic contract fixtures and synthetic live-canary artifacts are not promotion evidence. Authentic insufficient variants satisfy only the structural negative-example floor; without credential-backed live model records they do not prove insufficient-evidence accuracy. No promotion-grade live-model metric is claimed until the corpus is explicitly eligible and protected live records satisfy evaluator gates.
