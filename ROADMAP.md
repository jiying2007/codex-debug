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
- [x] Promotion Corpus v2 structural floor: 12 unique reviewed cases, 3 repositories, 4 failure kinds and 3 authentic insufficient-evidence variants
- [x] real historical corpus with `12/12` unique direct-parent transitions across Codex Debug, Safe Core, Codex Diagnose and Codex Change
- [x] current diversity `4/3` repositories, `5/4` failure kinds, `3/3` insufficient variants and `15` model-evaluation views
- [x] duplicate historical transition/bad/fix identities rejected so repeated fixes cannot inflate readiness
- [x] continuous read-only Promotion Provenance proving reviewed ref/direct-parent/ground-truth-file bindings without historical execution
- [x] promotion historical execution isolated from model/GitHub credentials and arbitrary host configuration
- [x] Promotion Corpus v2 summary-only insufficient-evidence projection with no raw output/source/Git-history/ground-truth leakage
- [x] Promotion Admission Policy v1: digest-bound quality/safety/token policy separate from structural corpus readiness
- [x] zero-tolerance admission safety gates for false support, false-fix candidates and patch-policy violations
- [x] same-run Qualification/Model binding by Debug SHA, Core gitlink, workflow/run/attempt/event/repository/source SHA
- [x] Promotion Model Evaluation sequencing: validate -> qualify all 12 -> live model -> safety -> admission -> artifact
- [x] calibration mode produces qualification/live/admission evidence without granting promotion authority
- [x] promotion mode requires explicit eligibility plus reviewed/calibrated admission policy and ready admission receipt
- [x] package / package-lock / product-contract development identity gated as one version (`0.1.10` for this line)
- [x] development-consumer Family lifecycle so unfinished Debug cannot block production Family freshness

## Required before active promotion

- [ ] trigger and retain a credential-backed calibration run with explicit historical-execution acknowledgement; this run will also create same-run 12-transition Qualification
- [ ] review live RCA assessment/root-cause metrics and choose evidence-based minimum thresholds
- [ ] review live false-fix and patch-applicability results across all reviewed evaluation views
- [ ] calibrate token usage and choose an evidence-based finite `maximumTokensPerCase`
- [ ] update `quality/promotion-admission-policy.json` to `reviewed=true`, calibrated token policy and reviewed quality thresholds
- [ ] explicitly review the separate `promotionEligible=true` corpus change only after calibration evidence is acceptable
- [ ] run `Promotion Model Evaluation` with `promotion_mode=true` and require same-run `PROMOTION_ADMISSION.json.ready=true`
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

Synthetic contract fixtures and synthetic live-canary artifacts are not promotion evidence. Structural readiness does not auto-authorize promotion. The checked-in 0.1.10 admission policy intentionally remains `reviewed=false` and token-uncalibrated until a real credential-backed historical calibration artifact exists; no RCA or token threshold is invented in advance.
