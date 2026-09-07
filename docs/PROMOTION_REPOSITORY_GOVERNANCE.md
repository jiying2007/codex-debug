# Promotion Repository Governance

Active promotion requires repository governance to be a machine-verifiable fact, not a checklist assertion.

## Development versus promotion

Ordinary development CI and `promotion_mode=false` calibration do **not** require protected main so the development line can continue while repository administration is being configured.

`promotion_mode=true` fails before historical Qualification or model execution unless `PROMOTION_REPOSITORY_GOVERNANCE.json.ready=true` can be generated from the live GitHub repository ruleset API.

## Required main ruleset

The promotion verifier accepts an **active branch ruleset** that targets the default/main branch and has no bypass actors. One ruleset must contain all of the following:

- `pull_request` — direct updates to the protected branch require the pull-request path;
- `pull_request.parameters.dismiss_stale_reviews_on_push=true` — a moved PR head cannot silently keep old review approval;
- `required_status_checks` containing `CI Gate`;
- `required_status_checks.parameters.strict_required_status_checks_policy=true` — the PR must be tested against the current base rather than reusing a stale check;
- `non_fast_forward` — force pushes are prohibited;
- `deletion` — branch deletion is prohibited.

The verifier intentionally does not treat the public branch endpoint's `protected=true` flag as sufficient. The connected/runtime token cannot reliably read classic branch-protection detail, while repository rulesets can be read and independently inspected. Active promotion therefore requires the stronger ruleset contract so every governance assertion is machine-verifiable.

## Receipt

`scripts/promotion-repository-governance.js` queries the live repository ruleset API and emits `PROMOTION_REPOSITORY_GOVERNANCE.json` containing:

- repository and branch;
- exact workflow source SHA;
- required status-check name;
- workflow run context;
- the satisfying ruleset id/name, required checks and ruleset digest;
- readiness/gaps;
- a self digest.

The GitHub token is scoped only to the governance step. It is not present during historical Qualification or inside historical reproduction, and the protected model credential remains scoped only to the live-model step.

The governance receipt is retained with the Promotion Model Evaluation artifacts when `promotion_mode=true`. It does not grant lifecycle/release authority by itself; it only proves that repository governance could not be bypassed at the time of the promotion run.

## Current development state

At the time this contract was introduced, `main` was not protected and the repository had no rulesets. Consequently a future `promotion_mode=true` run must fail at repository governance until an administrator creates and verifies the required main ruleset. This is deliberate fail-closed behavior.
