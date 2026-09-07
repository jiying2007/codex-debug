# Promotion Admission Contract

Promotion Admission v2 closes the authority gap between structural corpus readiness and any future `development -> active` decision. It does not grant release, publication, mutation, or lifecycle authority.

## Evidence chain

A promotion-mode model run must bind four independently validated layers from the **same GitHub Actions run and source commit**:

1. `PROMOTION_REPOSITORY_GOVERNANCE.json` + the exact reviewed `PROMOTION_REPOSITORY_GOVERNANCE_LOCK.json` — repository governance is still active, matches the administrator-reviewed Ruleset identity/projection, and is not using a stale reviewed lock.
2. `PROMOTION_CORPUS_QUALIFICATION.json` — Promotion Qualification v1 proving every reviewed bad commit reproduces and every exact direct-child fixed commit passes the same bounded command.
3. `PROMOTION_MODEL_EVAL.json` — credential-backed two-pass live model evidence over all 15 evaluation views.
4. `quality/promotion-admission-policy.json` — digest-bound reviewed quality, safety and token-efficiency policy.

`PROMOTION_ADMISSION.json` v2 binds the Debug commit, Safe Core gitlink, reviewed-corpus digest, evaluation-corpus digest, qualification digest, model-record digest, policy digest, Governance Lock digest, Governance Receipt digest, workflow run context, metrics, gaps and a self digest. Qualification, model and governance evidence from different run ids, attempts, workflows, repositories, events or source SHAs are rejected.

Calibration remains explicitly non-authoritative: for `promotion_mode=false`, Admission v2 records `governanceLockDigest=null` and `governanceReceiptDigest=null`. For `promotion_mode=true`, both digests are mandatory, the reviewed Governance Lock must validate, the live Governance Receipt must validate against that exact lock, and its run context must match Qualification/model evidence exactly.

## Shipped schema identity

The 0.1.12 packaged `product-contract.json` explicitly publishes the complete downstream Promotion evidence contract instead of requiring Family/release consumers to infer versions from repository code:

- `promotionTransitionVersion=1`;
- `promotionQualificationVersion=1`;
- `promotionAdmissionPolicyVersion=1`;
- `promotionAdmissionVersion=2`;
- `promotionRepositoryGovernanceLockVersion=1`;
- `promotionRepositoryGovernanceVersion=2`;
- `promotionCalibrationReportVersion=1`.

Model Evaluation Record v1 and Promotion Corpus v2 are also published by the Product Contract. The manifest gate imports the implementation modules' exported schema constants and requires all of these Product Contract values to match the implementation versions exactly. A future implementation schema bump without a matching shipped contract update therefore fails CI.

These fields describe evidence/control-plane schemas. They do not make the product active, eligible, qualified or released.

## Checked-in development policy

The 0.1.12 development line intentionally keeps the admission policy **unreviewed** because no credential-backed historical live calibration has yet been recorded. The checked-in policy therefore has:

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

`validate corpus/policy -> verify reviewed repository governance (promotion mode only) -> qualify 12 transitions -> live model evaluation -> zero-tolerance safety check -> promotion admission v2 -> receipt revalidation -> calibration review report -> artifact upload`

The workflow retains `contents: read` only. Historical reproduction receives the existing isolated HOME/Git/npm environment and cannot inherit model or GitHub credentials.

The protected model credential follows an additional least-privilege boundary: `OPENAI_API_KEY` is **not** defined at job scope and is injected only into the `Record historical live-model evaluation` step. Checkout, dependency installation, corpus/policy validation, the complete 12-transition Qualification step, Admission, Receipt revalidation, Calibration Report generation, and artifact upload do not receive the model credential through workflow environment. The live-model step itself fails closed before model execution when the protected credential is absent. Historical reproduction executed inside live evaluation continues to receive the scrubbed historical environment rather than the model process environment.

For `promotion_mode=false`, the workflow records qualification, live calibration, Admission and the digest-bound review-only Calibration Report, but the current draft policy causes `ready=false` without failing the calibration run. This is how RCA accuracy, insufficient-evidence accuracy, patch applicability and token usage are collected before choosing thresholds. Admission v2 explicitly records null governance digests in this mode so calibration cannot later be mistaken for active-promotion authority.

For `promotion_mode=true`, the workflow additionally requires a reviewed Governance Lock plus matching live Governance Receipt, requires the reviewed corpus and live record to be promotion eligible, and requires `PROMOTION_ADMISSION.json.ready=true`. Any missing/stale governance evidence, cross-run governance assembly, missing calibration provenance, draft threshold, uncalibrated token ceiling, stale Core/corpus calibration, safety regression, quality miss, SHA/Core mismatch or cross-run Qualification/model assembly fails closed.

## Required sequence before active promotion

1. Run credential-backed calibration with explicit historical-execution acknowledgement.
2. Review the generated Qualification, Admission Receipt, Calibration Report, model quality, patch-applicability results and token usage.
3. Use `promotion-policy-review.js` with explicitly reviewed thresholds and token ceiling to generate a candidate policy directly from that Calibration Report; review the resulting policy change and digest.
4. Create the required main Ruleset and merge the administrator-snapshot-derived reviewed Governance Lock.
5. Explicitly review the separate `promotionEligible=true` corpus change.
6. Run `Promotion Model Evaluation` with `promotion_mode=true`; reviewed Governance Lock + same-run live Governance Receipt + Qualification + model evidence must all bind into Admission v2 and pass.
7. Only after that evidence may lifecycle/release governance be considered.

Structural readiness (`12/12`, `4/3`, `5/4`, `3/3`, 15 views) remains distinct from qualification, repository governance, model quality, policy calibration provenance, promotion admission, lifecycle authority and release authority.
