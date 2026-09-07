# Promotion Repository Governance

Active promotion requires repository governance to be a machine-verifiable fact, not a checklist assertion.

## Development versus promotion

Ordinary development CI and `promotion_mode=false` calibration do **not** require protected main so the development line can continue while repository administration is being configured.

`promotion_mode=true` fails before historical Qualification or model execution unless both a reviewed governance lock and a matching live GitHub repository ruleset are present.

## Why a governance lock is required

GitHub's Rulesets REST API deliberately hides `bypass_actors` unless the caller has write access to the ruleset. The normal Promotion Model Evaluation `GITHUB_TOKEN` is intentionally low privilege and must not receive repository Administration write authority merely to inspect governance.

Therefore a missing `bypass_actors` property must never be interpreted as an empty bypass list.

The contract uses two phases:

1. **Administrator review phase.** After the main ruleset is created, an administrator exports the complete ruleset JSON with an identity that can see `bypass_actors`. `scripts/promotion-repository-governance-lock.js` refuses snapshots where that property is hidden, non-array, or non-empty. It writes a separate reviewed candidate lock binding the ruleset id, name, `updated_at`, full admin-snapshot digest and the low-privilege/public projection digest.
2. **Promotion runtime phase.** The workflow never receives the administrator credential. It reads only the checked-in reviewed lock plus the live low-privilege Rulesets API. The ruleset id, `updated_at`, target/enforcement/rules and public projection digest must still match the reviewed lock exactly.

Any later ruleset edit invalidates the lock and requires a new administrator snapshot/review. This includes a bypass-actor change because it changes the reviewed ruleset version/update marker; if a runtime token unexpectedly can see non-empty bypass actors, the verifier also rejects them directly.

The checked-in development lock at `quality/promotion-repository-governance-lock.json` intentionally starts with `reviewed=false` and `ruleset=null`. It cannot authorize promotion.

## Required main ruleset

The administrator-reviewed ruleset must be an **active branch ruleset** targeting the default/main branch with:

- `pull_request`;
- `pull_request.parameters.dismiss_stale_reviews_on_push=true`;
- `required_status_checks` containing exact context `CI Gate` **exactly once**;
- that `CI Gate` entry must set `integration_id=15368`, the GitHub Actions App that produces the repository's real `CI Gate` check-run;
- `required_status_checks.parameters.strict_required_status_checks_policy=true`;
- `non_fast_forward`;
- `deletion`;
- `bypass_actors=[]` in the administrator-visible snapshot.

The integration binding matters because GitHub Rulesets otherwise permit a required status check to accept a matching context from any source. Promotion requires the aggregate `CI Gate` specifically from GitHub Actions, not merely any status/check named `CI Gate`. The reviewed public-projection digest includes the `integration_id`, so changing or removing the expected source invalidates the Governance Lock.

## Creating the reviewed lock

After creating the ruleset, export its full detail with an administrator identity, for example:

```bash
gh api repos/jiying2007/codex-debug/rulesets/<RULESET_ID> > /tmp/codex-debug-ruleset.json
node scripts/promotion-repository-governance-lock.js \
  --repository jiying2007/codex-debug \
  --branch main \
  --required-check 'CI Gate' \
  --admin-snapshot /tmp/codex-debug-ruleset.json \
  --output PROMOTION_REPOSITORY_GOVERNANCE_LOCK.candidate.json
```

Review the generated candidate in a normal PR before replacing the checked-in draft lock. Never generate the lock inside GitHub Actions and never place an Administration-write token in the promotion workflow.

## Operator bootstrap

`scripts/promotion-authority-bootstrap.js` is the supported operator bridge for the two actions that intentionally require credentials/authority outside the low-privilege ChatGPT/GitHub-App surface. It does not grant promotion authority and is **dry-run by default**:

```bash
node scripts/promotion-authority-bootstrap.js
```

The dry run prints the exact Ruleset payload, required acknowledgement flags, lock candidate path and calibration `gh workflow run` arguments without invoking `gh` or mutating GitHub. The generated Ruleset payload binds `CI Gate` to GitHub Actions with `integration_id=15368`.

To create the required Ruleset when it does not exist, re-read its administrator-visible detail and generate a Governance Lock candidate:

```bash
node scripts/promotion-authority-bootstrap.js \
  --apply-ruleset \
  --acknowledge-ruleset-change
```

This operation is fail closed:

- a same-name existing Ruleset is validated and never silently patched;
- multiple same-name Rulesets are rejected as ambiguous;
- a hidden, malformed or non-empty `bypass_actors` surface is rejected;
- a `CI Gate` entry with no expected source, the wrong `integration_id`, or duplicate matching entries is rejected;
- weak rule semantics are rejected by Governance Lock generation;
- the only file written is `PROMOTION_REPOSITORY_GOVERNANCE_LOCK.candidate.json` (or the explicit `--lock-output` path);
- the checked-in lock is never replaced, committed or merged automatically.

The script uses the operator's locally authenticated `gh` process and does not accept, print or persist GitHub/OpenAI secrets.

The first real calibration is a separate explicit action and is always fixed to `promotion_mode=false`:

```bash
node scripts/promotion-authority-bootstrap.js \
  --trigger-calibration \
  --acknowledge-historical-execution
```

It dispatches `promotion-model-eval.yml` on `main` with `codex_version=latest`, empty model/verifier overrides and explicit historical-execution acknowledgement. Optional `--codex-version x.y.z`, `--model`, and `--verifier-model` values are passed only as workflow inputs. The script never reads or forwards the repository model secret; GitHub Actions resolves the protected secret inside the live-model step.

Both actions may be requested in one operator invocation by supplying both action/acknowledgement pairs. The calibration remains non-authoritative even if the Ruleset was just created because the reviewed lock still requires a normal PR + exact-head/main CI before `promotion_mode=true` can pass.

## Runtime receipt

For `promotion_mode=true`, `.github/workflows/promotion-model-eval.yml` copies the exact checked-in lock to `PROMOTION_REPOSITORY_GOVERNANCE_LOCK.json`, queries the live repository Rulesets API with its normal low-privilege GitHub token, and emits `PROMOTION_REPOSITORY_GOVERNANCE.json`.

The receipt binds:

- repository and branch;
- exact workflow source SHA;
- required status-check name;
- exact governance-lock digest;
- workflow run context;
- satisfying ruleset id/name/update marker, required checks and live public-projection digest;
- readiness/gaps;
- a self digest.

Both the lock sidecar and runtime receipt are retained with promotion artifacts. Neither grants lifecycle/release authority by itself; they prove that the repository governance reviewed by an administrator had not drifted at the time of the promotion run.

## Credential boundary

`GITHUB_TOKEN` is scoped only to the live governance step. It is not present during historical Qualification/reproduction. `OPENAI_API_KEY` remains scoped only to the live-model step. No administrator token is accepted by the promotion workflow.

## Current development state

Until an administrator creates the required ruleset and a reviewed lock is merged, `promotion_mode=true` must fail at repository governance. `promotion_mode=false` calibration remains intentionally available. This is deliberate fail-closed behavior.
