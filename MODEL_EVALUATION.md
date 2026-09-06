# Codex Debug Safe Model Evaluation

This document defines the development-only model-quality evidence chain. It is intentionally separate from Debug runtime verification: a model can be evaluated for causal reasoning quality without gaining command, mutation, commit, release or publication authority.

## Evidence layers

Codex Debug Safe uses three non-interchangeable layers:

1. **Contract fixture** — deterministic JSON used to prove the evaluator, digests and false-fix accounting. It is never live evidence and is never promotion eligible.
2. **Historical corpus qualification** — credential-free controller execution against code-reviewed historical repository cases. It proves that an exact bad commit fails and its exact reviewed fix commit passes the same reproduction. It does not call a model and is not a model-quality result.
3. **Live model evaluation** — the two-pass Debug model path analyzes the qualified bad workspace. A live record can become promotion evidence only when the reviewed corpus itself satisfies all readiness floors and is explicitly marked `promotionEligible=true`.

Synthetic live canaries remain useful for behavior smoke testing but are permanently `promotionEligible=false`.

## Versioned contracts

The development product contract binds:

- `modelEvaluationRecordVersion = 1`
- `promotionCorpusVersion = 1`
- `promotionTransitionVersion = 1`

Model Evaluation Record v1 binds corpus expectations, evidence digests, root-cause output digests, patch disposition/applicability, both model phases, usage and a self digest. Promotion transition records bind repository/ref/bad/fix identity, exact command digest, bad/fixed reproduction summaries and representative-output digests without retaining raw historical stdout/stderr in the qualification artifact.

## Promotion corpus case contract

Every promotion case must be code reviewed and must contain:

- a public `https://github.com/OWNER/REPO.git` repository URL;
- a reviewed fetch anchor (`refs/pull/N/head`, branch ref or tag ref);
- `mode = historical-observed`;
- `relation = direct-parent-fix`;
- exact 40-hex `badCommit` and `fixedCommit` values;
- an exact bounded reproduction command, run count and timeout;
- failure kind;
- digest-bound expected causal assessment, root-cause terms and patch policy;
- a digest-bound `fix-commit` ground truth whose commit equals `fixedCommit` and whose files are safe repository-relative paths.

The materializer fetches only the reviewed anchor, proves both commits exist in that fetched history, proves the fix is a direct child of the bad commit, then requires the exact command to produce a stable failure on the bad commit and zero failures on the fixed commit.

Case ids, `repository+badCommit+fixedCommit` transitions, bad commits and fixed commits are all unique across the reviewed corpus. Repeating one historical fix under another case id cannot increase readiness.

The fix commit and ground-truth summary are **not injected into the model prompt**. They exist only on the evaluator side.

## Current readiness floor

`promotionEligible=true` is invalid unless the corpus contains at least:

- 12 reviewed cases;
- 3 distinct repositories;
- 4 failure kinds;
- 3 insufficient-evidence negatives.

The current development corpus has **4 reviewed direct-parent historical transitions across 3 repositories and 4 failure kinds, with 0 insufficient-evidence negatives**. It covers Codex Debug, Safe Core and Codex Diagnose real fixes: evaluator-record integrity, causal infra-vs-test classification, the shared Actions pin-verifier false-negative, and GitLab unknown-length response streaming limits. Current readiness is therefore:

- cases: `4/12`;
- repositories: `3/3`;
- failure kinds: `4/4`;
- insufficient-evidence negatives: `0/3`.

Repository diversity and failure-kind diversity now meet their structural floors, but the corpus still lacks eight reviewed cases and all three insufficient-evidence negatives. It deliberately remains below the overall floor. Therefore any current historical or live artifact is calibration evidence only and cannot satisfy active-promotion quality requirements.

## Continuous Promotion Provenance

Ordinary pull-request and main CI run a read-only `Promotion Provenance` gate. This gate fetches only reviewed Git refs and inspects Git commit/tree metadata to prove that each bad/fix commit exists in the anchored history, the fix is the direct child of the bad commit, and every declared ground-truth file is actually touched by the reviewed fix.

`Promotion Provenance` **does not checkout or execute historical repository code**, does not run the reproduction command, and does not receive model credentials. Its artifact is provenance evidence only; it is not `Promotion Corpus Qualification` and cannot prove bad-fails/fixed-passes behavior by itself.

Historical execution remains in the separate manual qualification/model-evaluation authority domain described below.

## Historical execution authority

Historical repository code is untrusted code. Qualification and promotion workflows are manual and require an explicit acknowledgement that historical code will execute without an OS sandbox.

Historical reproduction runs receive a dedicated allowlisted environment only. In particular they do **not** inherit `OPENAI_API_KEY`, GitHub tokens, SSH agent state, cloud credentials or arbitrary host environment variables. HOME, XDG config, global Git config and npm user config are redirected into the temporary case directory; Git credential prompting is disabled.

The model process is a separate authority domain. Protected model credentials are available only to the Codex execution path, after the controller has collected historical failure evidence. The historical reproduction command is not rerun under the model credential environment.

This isolation reduces secret exposure but is still not an OS sandbox. Historical code runs with the runner's process identity. Use disposable runners/containers for repositories that are not fully trusted.

## Manual workflows

### Promotion Corpus Qualification

`Promotion Corpus Qualification` requires no model credential. It validates the manifest, materializes each reviewed history and emits `PROMOTION_CORPUS_QUALIFICATION.json`. The artifact contains digests and summaries, not raw historical logs.

### Promotion Model Evaluation

`Promotion Model Evaluation` additionally requires `CODEX_DEBUG_CANARY_OPENAI_API_KEY` (preferred) or `OPENAI_API_KEY` and the explicit historical-execution acknowledgement. It supports an optional fixed hypothesis model and optional fixed verifier model. A non-empty hypothesis model switches selection to `fixed`; an empty value uses Safe Core `auto` routing.

`promotion_mode=false` runs calibration against the currently reviewed corpus. `promotion_mode=true` fails before model execution unless the corpus readiness floor is satisfied and the manifest has been explicitly reviewed to `promotionEligible=true`.

The workflow has `contents: read` only, uses SHA-pinned Actions, performs no repository write, patch apply, commit, push, release, package publication or lifecycle promotion.

## Metrics

The evaluator records:

- causal-assessment accuracy;
- root-cause term hit rate;
- insufficient-evidence accuracy;
- false support count;
- false-fix candidate count;
- patch-policy violation count;
- hypothesis/verifier input, output, total and cached-input tokens;
- tokens per case.

Safety-critical counts fail closed in the live workflows. A patch accepted for a non-supported/forbidden case, or a verifier-accepted patch that does not pass deterministic patch applicability, is counted as false-fix evidence.

Token usage is recorded for calibration; no promotion token-efficiency threshold is claimed yet.

## Claim boundary

The following statements are currently allowed:

- Model Evaluation Record v1 exists and is deterministically tested.
- A real-historical promotion harness exists.
- The corpus readiness floor is enforced.
- Historical reproduction and model credentials are separated.
- Four reviewed direct-parent historical cases are bound to real fixes across Codex Debug, Safe Core and Codex Diagnose.
- Current reviewed coverage is `4/12` cases, `3/3` repositories, `4/4` failure kinds and `0/3` insufficient-evidence negatives.
- Continuous CI proves reviewed Git provenance without executing historical code.

The following statements are **not** allowed until corresponding artifacts exist:

- the promotion corpus is ready;
- live RCA precision meets a production target;
- false-fix rate is production-proven across real repositories;
- live token efficiency is calibrated at production scale;
- Codex Debug Safe is ready to move from `development` to `active`.
