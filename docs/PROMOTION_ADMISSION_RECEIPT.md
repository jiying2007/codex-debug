# Promotion Admission Receipt Revalidation

`PROMOTION_ADMISSION.json` is not trusted merely because the process that generated it exited successfully. The promotion workflow retains the exact policy sidecar and re-validates the completed admission receipt in a separate Node process before artifact upload.

The retained evidence set is:

- `PROMOTION_CORPUS_QUALIFICATION.json`
- `PROMOTION_MODEL_EVAL.json`
- `PROMOTION_MODEL_EVAL_SUMMARY.json`
- `PROMOTION_TRANSITIONS.json`
- `PROMOTION_ADMISSION_POLICY.json`
- `PROMOTION_ADMISSION.json`

`validate-promotion-admission.js` checks the admission receipt's canonical UTC timestamp, Debug SHA, Safe Core gitlink, corpus/evaluation/policy/qualification/model digests and self digest. It then reconstructs Promotion Admission from the retained policy, Qualification and live-model record and requires the reconstructed digest to equal the retained admission digest.

This catches two different tampering classes: direct mutation without updating the self digest, and a forged receipt whose attacker recomputes its self digest but whose fields no longer follow from the bound evidence sidecars. A different digest-valid policy sidecar is also rejected.

The validator additionally binds the evidence to the current checked-out Debug commit and Safe Core gitlink. In promotion mode it requires the reconstructed admission to be ready and therefore preserves the existing fail-closed requirements for explicit corpus eligibility, reviewed quality thresholds, zero-tolerance safety gates and calibrated token efficiency.

The workflow remains `contents: read` only. Receipt validation does not grant repository mutation, release, publication or lifecycle authority.
