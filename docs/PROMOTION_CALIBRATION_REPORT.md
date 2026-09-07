# Promotion Calibration Review Report

`PROMOTION_CALIBRATION_REPORT.json` is a digest-bound **review input**, not a promotion decision and not a policy generator. It is created only after the same-run Qualification, live model record and Promotion Admission receipt have been validated.

The report binds the exact Debug commit, Safe Core gitlink, reviewed/evaluation corpus digests, Admission Policy digest, Qualification digest, model-record digest, Admission digest and workflow run context. Its own self digest detects later mutation.

It summarizes the evidence that a reviewer needs before choosing quality and token thresholds:

- assessment, root-cause and insufficient-evidence accuracy;
- false-support, false-fix and patch-policy-violation counts;
- assessment/root-cause/insufficient miss case ids;
- patch proposed/accepted/rejected/none counts and accepted-patch applicability;
- total/mean/p50/p95/max tokens per evaluation view;
- hypothesis/verifier model, Codex version, provider mode and runtime-source lineage;
- per-case judgments, patch disposition/applicability and token usage;
- current Admission gaps.

The contract deliberately fixes `reviewInputOnly=true`, `authorizesPromotion=false` and `thresholdRecommendation=null`. No formula derives a quality floor or token ceiling from one calibration run, and the report never edits `quality/promotion-admission-policy.json`. Threshold selection remains a reviewed human decision based on retained calibration evidence.

The report is included in the read-only `Promotion Model Evaluation` artifact alongside Qualification, live model evidence, exact policy sidecar and Admission receipt. It is useful in both calibration and promotion mode, but its presence never grants lifecycle, release or publication authority.
