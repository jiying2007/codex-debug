# Promotion Admission Receipt Revalidation

`PROMOTION_ADMISSION.json` is not trusted merely because the process that generated it exited successfully. The promotion workflow retains the exact evidence sidecars and re-validates the completed Admission v2 receipt in a separate Node process before artifact upload.

The retained evidence set is:

- `PROMOTION_REPOSITORY_GOVERNANCE_LOCK.json` and `PROMOTION_REPOSITORY_GOVERNANCE.json` when `promotion_mode=true`
- `PROMOTION_CORPUS_QUALIFICATION.json`
- `PROMOTION_MODEL_EVAL.json`
- `PROMOTION_MODEL_EVAL_SUMMARY.json`
- `PROMOTION_TRANSITIONS.json`
- `PROMOTION_ADMISSION_POLICY.json`
- `PROMOTION_ADMISSION.json`

`validate-promotion-admission.js` checks the Admission receipt's canonical UTC timestamp, Debug SHA, Safe Core gitlink, corpus/evaluation/policy/qualification/model digests, optional-or-required governance digests and self digest. It then reconstructs Promotion Admission from the retained policy, Qualification, live-model record and, for promotion mode, the reviewed Governance Lock plus live Governance Receipt. The reconstructed digest must equal the retained Admission digest.

This catches direct mutation without updating the self digest, self-rehashed forged metrics, substitution of a different digest-valid policy, substitution of a different governance receipt, stale Governance Lock binding, and cross-run governance/qualification/model assembly.

Calibration mode remains explicit: Admission v2 must reconstruct with `governanceLockDigest=null` and `governanceReceiptDigest=null`. Promotion mode requires both governance sidecars, validates the live Governance Receipt against the reviewed lock, and requires its workflow/run/attempt/event/repository/source SHA context to match Qualification and model evidence exactly.

The validator additionally binds the evidence to the current checked-out Debug commit and Safe Core gitlink. In promotion mode it requires the reconstructed Admission to be ready and therefore preserves the existing fail-closed requirements for reviewed repository governance, explicit corpus eligibility, reviewed quality thresholds, zero-tolerance safety gates and calibrated token efficiency.

The workflow remains `contents: read` only. Receipt validation does not grant repository mutation, release, publication or lifecycle authority.
