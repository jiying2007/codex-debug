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
- `calibrationEvidence=null`;
- `maximumFalseSupport=0`;
- `maximumFalseFixCandidates=0`;
- `maximumPatchPolicyViolations=0`;
- `minimumInsufficientEvidenceAccuracy=1`;
- `minimumAssessmentAccuracy=null`;
- `minimumRootCauseTop1Accuracy=null`;
- `tokenEfficiency.calibrated=false`;
- `maximumTokensPerCase=null`.

Null RCA thresholds, null calibration evidence and the null token ceiling are deliberate fail-closed gaps, not defaults. A value must not be invented before live calibration evidence exists.

When the policy is later marked `reviewed=true`, all quality thresholds must be finite values in `[0,1]`, token calibration must be true, a finite positive `maximumTokensPerCase` is mandatory, and `calibrationEvidence` must bind the exact reviewed Calibration Report provenance. The bound fields are the report digest, Debug commit, Safe Core commit, reviewed-corpus digest, evaluation-corpus digest, Qualification digest, model-record digest, Admission digest and the original GitHub Actions run context. That run context must come from `Promotion Model Evaluation` via `workflow_dispatch`, and its `sourceSha` must equal the calibration Debug commit.

A reviewed policy is also invalid when its calibration evidence was collected against a different Safe Core gitlink or a different reviewed/evaluation corpus. This prevents an old calibration from silently authorizing thresholds after Core or benchmark identity changes. The calibration Debug SHA itself is historical provenance and is not required to equal the later policy-review commit, because reviewing the policy necessarily changes the repository SHA.

## Deterministic policy review

Reviewed policy candidates must be generated from the actual `PROMOTION_CALIBRATION_REPORT.json`, not assembled by copying digest strings by hand. `scripts/promotion-policy-review.js` validates the Calibration Report self digest and run identity, proves its Safe Core and reviewed/evaluation corpus still match the current repository, preserves the fixed zero-tolerance safety limits and `minimumInsufficientEvidenceAccuracy=1`, then derives `calibrationEvidence` directly from that report.

The reviewer still chooses the assessment threshold, root-cause threshold and token ceiling explicitly. The generator does **not** recommend values. It refuses an assessment or root-cause minimum above the measured calibration accuracy, refuses a token ceiling below the measured calibration mean, and refuses any calibration containing false support, false-fix candidates, patch-policy violations or an insufficient-evidence score below the fixed floor.

Example after a real calibration artifact has been downloaded:

```bash
node scripts/promotion-policy-review.js \
  --report PROMOTION_CALIBRATION_REPORT.json \
  --assessment <reviewed-minimum> \
  --root-cause <reviewed-minimum> \
  --max-tokens <reviewed-ceiling> \
  --output PROMOTION_ADMISSION_POLICY.candidate.json
```

The candidate is intentionally written to a separate file. Replacing `quality/promotion-admission-policy.json` remains an explicit reviewed repository change; the generator never mutates the checked-in policy automatically.

## Workflow sequencing

`Promotion Model Evaluation` performs the authority chain in one read-only workflow run after explicit acknowledgement that historical code executes without an OS sandbox:

`validate corpus/policy -> qualify 12 transitions -> live model evaluation -> zero-tolerance safety check -> promotion admission -> receipt revalidation -> calibration review report -> artifact upload`

The workflow retains `contents: read` only. Historical reproduction receives the existing isolated HOME/Git/npm environment and cannot inherit model or GitHub credentials.

The protected model credential follows an additional least-privilege boundary: `OPENAI_API_KEY` is **not** defined at job scope and is injected only into the `Record historical live-model evaluation` step. Checkout, dependency installation, corpus/policy validation, the complete 12-transition Qualification step, Admission, Receipt revalidation, Calibration Report generation, and artifact upload do not receive the model credential through workflow environment. The live-model step itself fails closed before model execution when the protected credential is absent. Historical reproduction executed inside live evaluation continues to receive the scrubbed historical environment rather than the model process environment.

For `promotion_mode=false`, the workflow records qualification, live calibration, Admission and the digest-bound review-only Calibration Report, but the current draft policy causes `ready=false` without failing the calibration run. This is how RCA accuracy, insufficient-evidence accuracy, patch applicability and token usage are collected before choosing thresholds.

For `promotion_mode=true`, the workflow additionally requires the reviewed corpus and live record to be promotion eligible and requires `PROMOTION_ADMISSION.json.ready=true`. Any missing calibration provenance, draft threshold, uncalibrated token ceiling, stale Core/corpus calibration, safety regression, quality miss, SHA/Core mismatch or cross-run evidence assembly fails closed.

## Required sequence before active promotion

1. Run credential-backed calibration with explicit historical-execution acknowledgement.
2. Review the generated Qualification, Admission Receipt, Calibration Report, model quality, patch-applicability results and token usage.
3. Use `promotion-policy-review.js` with explicitly reviewed thresholds and token ceiling to generate a candidate policy directly from that Calibration Report; review the resulting policy change and digest.
4. Explicitly review the separate `promotionEligible=true` corpus change.
5. Run `Promotion Model Evaluation` with `promotion_mode=true`; same-run Qualification and Admission must pass, and the reviewed policy calibration must still match the current Safe Core and corpus identity.
6. Only after that evidence may lifecycle/release governance be considered.

Structural readiness (`12/12`, `4/3`, `5/4`, `3/3`, 15 views) remains distinct from qualification, model quality, policy calibration provenance, promotion admission, lifecycle authority and release authority.
