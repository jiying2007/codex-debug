# Codex Debug Safe Model Evaluation

This document defines the development-only model-quality and promotion-evidence chain. Model evaluation never grants command, mutation, commit, release, publication, or lifecycle authority.

## Evidence layers

Codex Debug Safe keeps the following layers non-interchangeable:

1. **Contract fixture** — deterministic evaluator/digest/false-fix tests. Never live evidence and never promotion eligible.
2. **Promotion Provenance** — ordinary read-only CI proves reviewed Git refs, direct-parent relationships and ground-truth-file membership without checking out or executing historical code.
3. **Historical corpus qualification** — explicitly authorized historical execution proves every exact bad commit fails and every exact reviewed direct-child fix passes the same bounded reproduction.
4. **Live model evaluation** — credential-backed two-pass Debug analysis records RCA, insufficient-evidence behavior, patch disposition/applicability and token usage.
5. **Promotion Admission v2** — binds same-run reviewed repository governance, Qualification, live model evidence and a reviewed digest-bound admission policy before a promotion-mode run can pass.

Synthetic live canaries remain useful smoke evidence but are permanently `promotionEligible=false`.

## Versioned contracts

The shipped 0.1.18 development Product Contract binds the complete downstream model-quality and promotion-authority evidence schema set:

- `modelEvaluationRecordVersion = 1`
- `promotionCorpusVersion = 2`
- `promotionTransitionVersion = 1`
- `promotionQualificationVersion = 1`
- `promotionAdmissionPolicyVersion = 1`
- `promotionAdmissionVersion = 2`
- `promotionRepositoryGovernanceLockVersion = 1`
- `promotionRepositoryGovernanceVersion = 2`
- `promotionCalibrationReportVersion = 1`

Model Evaluation Record v1 binds corpus expectations, evidence/root-cause digests, patch disposition/applicability, both model phases, usage and a self digest. Promotion Qualification v1 binds Debug/Core identity, the reviewed corpus digest, readiness, GitHub run context, all 22 bad/fixed transition results and a self digest. Promotion Admission v2 additionally binds policy, Qualification, model-record, reviewed Governance Lock and live Governance Receipt digests plus the exact same workflow run context. These versions are part of the packaged `product-contract.json`; downstream Family/release consumers do not need to infer evidence schemas from script names or repository history.

The manifest gate also imports the implementation modules' exported schema constants and requires every Product Contract field above to equal the implementation version. A schema implementation bump without a matching shipped Product Contract update therefore fails CI.

## Promotion corpus case contract

Every reviewed case is one unique real `historical-observed` / `direct-parent-fix` transition with:

- a public `https://github.com/OWNER/REPO.git` repository;
- a reviewed `refs/pull/N/head`, branch or tag anchor;
- unique exact 40-hex bad/fixed commits;
- one bounded reproduction command, run count and timeout;
- failure kind;
- digest-bound expected assessment/root-cause terms/patch policy;
- digest-bound `fix-commit` ground truth with safe repository-relative files.

The historical materializer fetches only the reviewed anchor, proves both commits exist in the anchored history, proves the fix is the direct child of the bad commit, executes the same command on both revisions, requires a reproducible bad failure and zero fixed failures, and scrubs the temporary checkout afterward. Case ids, transition identities, bad commits and fixed commits are unique across the corpus.

Ground-truth fix metadata is evaluator-side only and is never injected into the model prompt.

## Insufficient-evidence variants

Promotion Corpus v2 may attach one digest-bound `summary-only` insufficient variant to a reviewed transition. It is an evaluation view, not another reviewed transition. Every variant requires:

- `assessment = insufficient`;
- `patchPolicy = forbidden`;
- no root-cause terms;
- `includeGitHistory=false`;
- no raw stdout/stderr, source anchors, case identity, fixed SHA, ground-truth summary/files or custom model-visible hint.

A pre-model leak check fails closed. The corpus contains three authentic insufficient variants on real Debug, Safe Core and Diagnose transitions; they increase model-evaluation views without inflating Promotion Provenance or the 20-case floor.

## Current structural readiness

The structural floor requires at least 20 unique reviewed historical cases, 20 independent root-cause groups, 3 repositories, 4 failure kinds and 3 authentic insufficient variants.

Current state:

- reviewed cases: `22/20`;
- independent root-cause groups: `20/20`;
- repositories: `4/3`;
- failure kinds: `7/4`;
- insufficient-evidence variants: `3/3`;
- model-evaluation views: `25`;
- structural gaps: none.

The structural readiness floor is fully satisfied. This is deliberately **not** promotion authorization: the checked-in corpus remains `promotionEligible=false` and lifecycle remains `development`.

Promotion Provenance intentionally sees **22 historical transitions, not 25 evaluation views**. It does not execute reproduction commands and is not Qualification.

## Retrospective partitions and executable controls

The 22 transitions represent 20 root-cause groups. Three HTTP response-buffering limits share one lineage and stay together in `dev`; they are not counted as three independent causes. The manifest assigns 18 cases / 16 groups to `dev` and 4 cases / 4 groups to `holdout`. The validator rejects a root-cause group split across partitions.

Every case is `reviewed-retrospective`, and `partitionPolicy.blind=false` is explicit. Contributors have inspected the source and ground truth for all cases. These partitions are metadata for future separately reported evaluations; current evaluation runners still report the complete corpus together. They do not constitute a new blind test or an unbiased holdout score.

The ten added transitions execute legitimate controls before exercising their defect. Both the bad and fixed versions must emit `POSITIVE_CONTROLS_PASS` after those assertions, or the historical runner rejects the transition. Exact commands, direct-parent SHAs, affected files and control descriptions are recorded in `quality/promotion-corpus.json`. A source context and diff can be reconstructed by fetching its reviewed `anchorRef` and running `git diff <badCommit> <fixedCommit> -- <groundTruth.files>`; no generated or unrelated patch is substituted for the historical fix.

The FIFO case requires a POSIX host with `mkfifo`; its child process is killed after one second on the bad revision to avoid blocking the qualification process. Performance cases use fixed observations to reproduce evidence and comparison defects. They do not measure an optimization or establish current performance gains.

The local record `quality/historical-replay-20261115.json` binds this corpus digest, canonical public repository anchors, both immutable revisions, exact historical Core gitlinks, source/diff hashes and the existing runner source hashes. It records 22/22 deterministic bad-fails/fixed-passes replays, one run per revision, with all ten new cases completing their positive controls on both revisions. Older cases retain their existing commands and do not claim newly added positive controls.

This host could not resolve GitHub from the scrubbed historical environment. Trusted acquisition fetched complete public repository mirrors first; `runTransitionInRepo` then replayed the exact revisions from those mirrors with the original environment allowlist. Only Core transport was redirected to its acquired local mirror, while the historical `.gitmodules` canonical URL and exact gitlink checks remained intact. The record explicitly has `qualificationAuthority=false` and `freshModel=not_run`; it is local review evidence, not a remote Actions gate, a same-run Admission receipt or a model measurement. The standard manual Qualification workflow remains the source of remote qualification authority.

## Historical execution authority

Historical repository code is untrusted code. Qualification and Promotion Model Evaluation require explicit acknowledgement that historical code executes without an OS sandbox.

Historical reproduction receives an allowlisted environment only. It does **not** inherit `OPENAI_API_KEY`, GitHub tokens, SSH agent state, cloud credentials or arbitrary host variables. HOME, XDG config, global Git config and npm user config are redirected to the temporary case directory; Git credential prompting is disabled. Protected model credentials are injected only into the Codex execution authority domain after controller-side evidence acquisition.

## Promotion Admission v2

`quality/promotion-admission-policy.json` remains Promotion Admission Policy v1 and is self-digested. Safety gates are zero-tolerance:

- false support: `0` maximum;
- false-fix candidates: `0` maximum;
- patch-policy violations: `0` maximum;
- insufficient-evidence accuracy: `1` minimum.

The current development policy deliberately has `reviewed=false`, `minimumAssessmentAccuracy=null`, `minimumRootCauseTop1Accuracy=null`, `tokenEfficiency.calibrated=false`, and `maximumTokensPerCase=null`. These are explicit fail-closed gaps because credential-backed historical live calibration does not yet exist. No token-efficiency threshold is claimed or invented before calibration.

When a policy is later marked reviewed, both RCA thresholds must be finite values in `[0,1]`, insufficient accuracy remains explicitly bounded, token calibration must be true, and a finite positive token ceiling is required.

Admission v2 rejects Qualification and model records unless they bind the same Debug commit, Safe Core gitlink, GitHub workflow, run id, run attempt, event, repository and source SHA. It also recomputes model metrics instead of trusting a supplied summary.

Calibration mode explicitly records `governanceLockDigest=null` and `governanceReceiptDigest=null`. Promotion mode requires both a reviewed `PROMOTION_REPOSITORY_GOVERNANCE_LOCK.json` and a live `PROMOTION_REPOSITORY_GOVERNANCE.json`; the receipt must validate against the lock and share the exact run context with Qualification/model evidence. Both governance digests are part of the Admission v2 self digest and are independently reconstructed during receipt revalidation.

## Manual workflows

### Promotion Corpus Qualification

`Promotion Corpus Qualification` requires no model credential. It validates the manifest, executes all 22 reviewed transitions under isolated historical execution and emits `PROMOTION_CORPUS_QUALIFICATION.json` using Promotion Qualification v1.

### Promotion Model Evaluation

`Promotion Model Evaluation` requires protected model credentials plus explicit historical-execution acknowledgement. In 0.1.18 it executes one read-only evidence chain in the same run:

`validate corpus/policy -> verify reviewed repository governance when promotion_mode=true -> qualify 22 transitions -> live model evaluation -> zero-tolerance safety check -> Promotion Admission v2 -> receipt revalidation -> calibration review report -> artifact upload`

The workflow retains `contents: read` only and performs no patch apply, repository write, commit, push, release, publication or lifecycle promotion.

`promotion_mode=false` is calibration mode. It records Qualification, live metrics and `PROMOTION_ADMISSION.json`, but the checked-in draft policy causes admission `ready=false` without turning calibration itself into a failed experiment. Governance digests remain explicitly null.

`promotion_mode=true` is fail-closed promotion evidence. It requires a reviewed Governance Lock plus matching live Governance Receipt, structural readiness, explicit `promotionEligible=true`, claimable live metrics, a reviewed/calibrated admission policy and `PROMOTION_ADMISSION.json.ready=true` from the same run.

## Metrics

The evaluator records causal-assessment accuracy, root-cause term hit rate, insufficient-evidence accuracy, false support, false-fix candidates, patch-policy violations, patch applicability, both model phases' token usage and tokens per evaluation case. Safety-critical counts remain zero-tolerance in live workflows.

Both phases must report complete non-negative safe-integer input and output token counts. The collector accepts Codex JSONL snake_case names and derives total tokens from those two observed counts when the provider omits a separate total. An explicit total must match their sum. Missing, null, malformed, conflicting or inconsistent counts remain unknown (`usage=null`) and cannot satisfy evaluation, calibration or admission. Explicitly reported zero counts remain valid. An unreported cached-input count stays unknown in summaries; it is never inferred as zero.

Debug uses the raw observed JSONL usage for both session accounting and evaluation records. It does not treat the pinned Core compatibility envelope's default zero values as observations. Unknown usage retains the admitted request estimate in the session ledger until an actual complete count exists.

Both evaluation runners save the completed model record, and historical transitions when present, before validating it. Failed validation exits nonzero, removes a stale summary and produces no successful summary. Their workflows retain available artifacts even after failure so an unknown-usage run remains inspectable without becoming calibration evidence.

Token usage is currently a calibration measurement only. An evidence-based `maximumTokensPerCase` must be reviewed after live calibration before Promotion Admission can become ready.

## Claim boundary

Currently allowed statements include:

- Model Evaluation Record v1, Promotion Corpus v2, Promotion Qualification v1, Promotion Admission Policy v1, Promotion Admission v2, Governance Lock v1, Governance Receipt v2 and Calibration Report v1 are contract-versioned and deterministically tested.
- Twenty-two unique reviewed direct-parent transitions span Codex Debug, Safe Core, Codex Diagnose and Codex Change.
- Structural coverage is `22/20` cases, `20/20` independent root-cause groups, `4/3` repositories, `7/4` failure kinds and `3/3` insufficient variants, with `25` evaluation views and no structural gap.
- Promotion Provenance is continuously proven without historical execution.
- The checked-in admission policy is intentionally unreviewed and token-uncalibrated, therefore promotion remains fail closed.

The following statements are **not** allowed until corresponding artifacts exist:

- the promotion corpus is fully qualified by historical execution;
- live RCA precision meets a production target;
- live insufficient-evidence accuracy meets a production target;
- false-fix rate and patch applicability are production-proven across the reviewed corpus;
- live token efficiency is calibrated at production scale;
- Promotion Admission is ready;
- Codex Debug Safe is ready to move from `development` to `active`.
