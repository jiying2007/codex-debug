# Codex Debug Safe Model Evaluation

This document defines the development-only model-quality and promotion-evidence chain. Model evaluation never grants command, mutation, commit, release, publication, or lifecycle authority.

## Evidence layers

Codex Debug Safe keeps the following layers non-interchangeable:

1. **Contract fixture** — deterministic evaluator/digest/false-fix tests. Never live evidence and never promotion eligible.
2. **Promotion Provenance** — ordinary read-only CI proves reviewed Git refs, direct-parent relationships and ground-truth-file membership without checking out or executing historical code.
3. **Historical corpus qualification** — explicitly authorized historical execution proves every exact bad commit fails and every exact reviewed direct-child fix passes the same bounded reproduction.
4. **Live model evaluation** — credential-backed two-pass Debug analysis records RCA, insufficient-evidence behavior, patch disposition/applicability and token usage.
5. **Promotion Admission v1** — binds same-run Qualification, live model evidence and a reviewed digest-bound admission policy before a promotion-mode run can pass.

Synthetic live canaries remain useful smoke evidence but are permanently `promotionEligible=false`.

## Versioned contracts

The development product contract binds:

- `modelEvaluationRecordVersion = 1`
- `promotionCorpusVersion = 2`
- `promotionTransitionVersion = 1`
- `promotionAdmissionPolicyVersion = 1`

Model Evaluation Record v1 binds corpus expectations, evidence/root-cause digests, patch disposition/applicability, both model phases, usage and a self digest. Qualification records bind Debug/Core identity, the reviewed corpus digest, readiness, GitHub run context, all 12 bad/fixed transition results and a self digest. Promotion Admission v1 additionally binds the policy, Qualification and model-record digests plus the exact same workflow run context.

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

A pre-model leak check fails closed. The corpus contains three authentic insufficient variants on real Debug, Safe Core and Diagnose transitions; they increase model-evaluation views without inflating Promotion Provenance or the 12-case floor.

## Current structural readiness

The structural floor requires at least 12 unique reviewed historical cases, 3 repositories, 4 failure kinds and 3 authentic insufficient variants.

Current state:

- reviewed cases: `12/12`;
- repositories: `4/3`;
- failure kinds: `5/4`;
- insufficient-evidence variants: `3/3`;
- model-evaluation views: `15`;
- structural gaps: none.

The structural readiness floor is fully satisfied. This is deliberately **not** promotion authorization: the checked-in corpus remains `promotionEligible=false` and lifecycle remains `development`.

Promotion Provenance intentionally sees **12 historical transitions, not 15 evaluation views**. It does not execute reproduction commands and is not Qualification.

## Historical execution authority

Historical repository code is untrusted code. Qualification and Promotion Model Evaluation require explicit acknowledgement that historical code executes without an OS sandbox.

Historical reproduction receives an allowlisted environment only. It does **not** inherit `OPENAI_API_KEY`, GitHub tokens, SSH agent state, cloud credentials or arbitrary host variables. HOME, XDG config, global Git config and npm user config are redirected to the temporary case directory; Git credential prompting is disabled. Protected model credentials are injected only into the Codex execution authority domain after controller-side evidence acquisition.

## Promotion Admission v1

`quality/promotion-admission-policy.json` is self-digested. Safety gates are already zero-tolerance:

- false support: `0` maximum;
- false-fix candidates: `0` maximum;
- patch-policy violations: `0` maximum;
- insufficient-evidence accuracy: `1` minimum.

The current development policy deliberately has `reviewed=false`, `minimumAssessmentAccuracy=null`, `minimumRootCauseTop1Accuracy=null`, `tokenEfficiency.calibrated=false`, and `maximumTokensPerCase=null`. These are explicit fail-closed gaps because credential-backed historical live calibration does not yet exist. No token-efficiency threshold is claimed or invented before calibration.

When a policy is later marked reviewed, both RCA thresholds must be finite values in `[0,1]`, insufficient accuracy remains explicitly bounded, token calibration must be true, and a finite positive token ceiling is required.

Admission rejects Qualification and model records unless they bind the same Debug commit, Safe Core gitlink, GitHub workflow, run id, run attempt, event, repository and source SHA. It also recomputes model metrics instead of trusting a supplied summary.

## Manual workflows

### Promotion Corpus Qualification

`Promotion Corpus Qualification` requires no model credential. It validates the manifest, executes all 12 reviewed transitions under isolated historical execution and emits `PROMOTION_CORPUS_QUALIFICATION.json`.

### Promotion Model Evaluation

`Promotion Model Evaluation` requires protected model credentials plus explicit historical-execution acknowledgement. In 0.1.10 it executes one read-only evidence chain in the same run:

`validate corpus/policy -> qualify 12 transitions -> live model evaluation -> zero-tolerance safety check -> Promotion Admission -> artifact upload`

The workflow retains `contents: read` only and performs no patch apply, repository write, commit, push, release, publication or lifecycle promotion.

`promotion_mode=false` is calibration mode. It records Qualification, live metrics and `PROMOTION_ADMISSION.json`, but the checked-in draft policy causes admission `ready=false` without turning calibration itself into a failed experiment.

`promotion_mode=true` is fail-closed promotion evidence. It requires structural readiness, explicit `promotionEligible=true`, claimable live metrics, a reviewed/calibrated admission policy and `PROMOTION_ADMISSION.json.ready=true` from the same run.

## Metrics

The evaluator records causal-assessment accuracy, root-cause term hit rate, insufficient-evidence accuracy, false support, false-fix candidates, patch-policy violations, patch applicability, both model phases' token usage and tokens per evaluation case. Safety-critical counts remain zero-tolerance in live workflows.

Token usage is currently a calibration measurement only. An evidence-based `maximumTokensPerCase` must be reviewed after live calibration before Promotion Admission can become ready.

## Claim boundary

Currently allowed statements include:

- Model Evaluation Record v1, Promotion Corpus v2 and Promotion Admission Policy v1 exist and are deterministically tested.
- Twelve unique reviewed direct-parent transitions span Codex Debug, Safe Core, Codex Diagnose and Codex Change.
- Structural coverage is `12/12`, `4/3`, `5/4`, `3/3`, with `15` evaluation views and no structural gap.
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
