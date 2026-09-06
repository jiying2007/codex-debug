# Promotion Admission Contract

Promotion Admission v1 closes the authority gap between structural corpus readiness and any future `development -> active` decision. It does not grant release, publication, mutation, or lifecycle authority.

## Evidence chain

A promotion-mode model run must bind three independently validated layers from the **same GitHub Actions run and source commit**:

1. `PROMOTION_CORPUS_QUALIFICATION.json` — every reviewed bad commit reproduces and every exact direct-child fixed commit passes the same bounded command.
2. `PROMOTION_MODEL_EVAL.json` — credential-backed two-pass live model evidence over all 15 evaluation views.
3. `quality/promotion-admission-policy.json` — digest-bound reviewed quality, safety and token-efficiency policy.

`PROMOTION_ADMISSION.json` binds the Debug commit, Safe Core gitlink, reviewed-corpus digest, evaluation-corpus digest, qualification digest, model-record digest, policy digest, workflow run context, metrics, gaps and a self digest. Qualification and model evidence from different run ids, attempts, workflows, repositories, events or source SHAs are rejected.

## Checked-in development policy

The 0.1.10 development line intentionally keeps the admission policy **unreviewed** because no credential-backed historical live calibration has yet been recorded. The checked-in policy therefore has:

- `reviewed=false`;
- `maximumFalseSupport=0`;
- `maximumFalseFixCandidates=0`;
- `maximumPatchPolicyViolations=0`;
- `minimumInsufficientEvidenceAccuracy=1`;
- `minimumAssessmentAccuracy=null`;
- `minimumRootCauseTop1Accuracy=null`;
- `tokenEfficiency.calibrated=false`;
- `maximumTokensPerCase=null`.

Null RCA thresholds and the null token ceiling are deliberate fail-closed gaps, not defaults. A value must not be invented before live calibration evidence exists. When the policy is later marked `reviewed=true`, all quality thresholds must be finite values in `[0,1]`, token calibration must be true, and a finite positive `maximumTokensPerCase` is mandatory.

## Workflow sequencing

`Promotion Model Evaluation` now performs the authority chain in one read-only workflow run after explicit acknowledgement that historical code executes without an OS sandbox:

`validate corpus/policy -> qualify 12 transitions -> live model evaluation -> zero-tolerance safety check -> promotion admission -> artifact upload`

The workflow retains `contents: read` only. Historical reproduction receives the existing isolated HOME/Git/npm environment and cannot inherit model or GitHub credentials. Model credentials are used only by the Codex execution path.

For `promotion_mode=false`, the workflow records qualification, live calibration and an admission record, but the current draft policy causes `ready=false` without failing the calibration run. This is how RCA accuracy, insufficient-evidence accuracy and token usage are collected before choosing thresholds.

For `promotion_mode=true`, the workflow additionally requires the reviewed corpus and live record to be promotion eligible and requires `PROMOTION_ADMISSION.json.ready=true`. Any draft threshold, uncalibrated token ceiling, safety regression, quality miss, SHA/Core mismatch or cross-run evidence assembly fails closed.

## Required sequence before active promotion

1. Run credential-backed calibration with explicit historical-execution acknowledgement.
2. Review the generated Qualification, model summary, patch-applicability results and token usage.
3. Set evidence-based RCA thresholds and a token ceiling; recompute the policy digest and review that policy change.
4. Explicitly review the separate `promotionEligible=true` corpus change.
5. Run `Promotion Model Evaluation` with `promotion_mode=true`; same-run Qualification and Admission must pass.
6. Only after that evidence may lifecycle/release governance be considered.

Structural readiness (`12/12`, `4/3`, `5/4`, `3/3`, 15 views) remains distinct from qualification, model quality, promotion admission, lifecycle authority and release authority.
