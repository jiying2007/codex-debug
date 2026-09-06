# Codex Debug Safe Model Evaluation

This document defines the development-only model-quality evidence chain. It is intentionally separate from Debug runtime verification: model evaluation never grants command, mutation, commit, release, publication, or lifecycle authority.

## Evidence layers

Codex Debug Safe uses three non-interchangeable layers:

1. **Contract fixture** — deterministic JSON used to prove evaluator, digest, and false-fix accounting behavior. It is never live evidence and is never promotion eligible.
2. **Historical corpus qualification** — credential-free controller execution against code-reviewed historical repository cases. It proves an exact bad commit fails and its exact reviewed direct-child fix passes the same reproduction. It does not call a model and is not a model-quality result.
3. **Live model evaluation** — the two-pass Debug model path analyzes the qualified bad workspace. A live record can become promotion evidence only when all readiness floors are satisfied and the reviewed corpus is explicitly marked `promotionEligible=true`.

Synthetic live canaries remain useful for behavior smoke testing but are permanently `promotionEligible=false`.

## Versioned contracts

The development product contract binds:

- `modelEvaluationRecordVersion = 1`
- `promotionCorpusVersion = 2`
- `promotionTransitionVersion = 1`

Model Evaluation Record v1 binds corpus expectations, evidence digests, root-cause output digests, patch disposition/applicability, both model phases, usage, and a self digest. Promotion transition records bind repository/ref/bad/fix identity, exact command digest, bad/fixed reproduction summaries, and representative-output digests without retaining raw historical stdout/stderr in qualification artifacts.

## Promotion corpus case contract

Every reviewed promotion case represents one unique real historical transition and must contain:

- a public `https://github.com/OWNER/REPO.git` URL;
- a reviewed fetch anchor such as `refs/pull/N/head`, a branch ref, or a tag ref;
- `mode = historical-observed`;
- `relation = direct-parent-fix`;
- exact 40-hex `badCommit` and `fixedCommit` values;
- an exact bounded reproduction command, run count, and timeout;
- failure kind;
- digest-bound expected causal assessment, root-cause terms, and patch policy;
- digest-bound `fix-commit` ground truth whose commit equals `fixedCommit` and whose files are safe repository-relative paths.

The materializer fetches only the reviewed anchor, proves both commits exist in that anchored history, proves the fix is the direct child of the bad commit, then requires the exact command to produce a stable failure on the bad commit and zero failures on the fixed commit.

Case ids, `repository+badCommit+fixedCommit` transitions, bad commits, and fixed commits are unique across the reviewed corpus. Repeating one historical fix under another case id cannot increase readiness. Ground-truth fix metadata is evaluator-side only and is not injected into the model prompt.

## Insufficient-evidence variants

Promotion Corpus v2 allows one reviewed historical transition to attach one optional `insufficientVariant`. The variant is a second **evaluation view**, not a second reviewed case. It can increase `insufficientCases` and the number of model-evaluation views, but it never increases the 12-case floor, repository count, failure-kind count, bad/fix identity set, or Promotion Provenance transition count.

Every insufficient variant is fail-closed:

- `expected.assessment = insufficient`;
- `patchPolicy = forbidden`;
- `rootCauseTerms = []`;
- the only permitted projection is digest-bound `{ "version": 1, "mode": "summary-only" }`;
- authors cannot supply custom model-visible prompt text or hints.

The underlying real transition is still qualified with full controller evidence. During live model evaluation, the variant receives only controller-generated summary-only evidence: failure kind, run/failure/timeout counts, and the reproduction-command digest. It receives **no raw stdout/stderr**, source anchors, case or variant identity, reviewed fix SHA, ground-truth summary/files, or Git history; `includeGitHistory=false` is mandatory. A pre-model leak check fails closed if hidden reviewed ground truth appears in the projected evidence.

### Current authentic insufficient variants

The reviewed corpus now attaches **three authentic insufficient-evidence variants** to three already-reviewed real transitions:

- Codex Debug causal infra-vs-test precedence;
- Safe Core Actions-pin parser false-negative;
- Codex Diagnose unknown-length response streaming limit.

Each variant withholds the concrete mechanism and raw failure/source/history evidence while keeping the real reviewed bad→direct-child-fix transition and evaluator-side ground truth. The three variants therefore satisfy the structural `3/3` insufficient-negative floor without inflating the reviewed-transition case count.

This is still only a corpus/evidence-availability fact. No live-model insufficient-evidence accuracy is claimed until a credential-backed live model-evaluation record exists.

## Current readiness floor

`promotionEligible=true` is invalid unless the corpus contains at least:

- 12 unique reviewed historical cases;
- 3 distinct repositories;
- 4 failure kinds;
- 3 authentic insufficient-evidence variants.

Current structural readiness is:

- reviewed cases: `4/12`;
- repositories: `3/3`;
- failure kinds: `4/4`;
- insufficient-evidence variants: `3/3`;
- model-evaluation views: `7`.

The only structural readiness gap is therefore `cases 4/12`. The corpus remains `promotionEligible=false`. Eight additional unique reviewed historical transitions are still required, and structural readiness alone does not establish live RCA precision, live insufficient-evidence accuracy, false-fix rate, patch applicability, or token efficiency.

## Continuous Promotion Provenance

Ordinary pull-request and main CI run a read-only `Promotion Provenance` gate. It fetches only reviewed Git refs and inspects Git commit/tree metadata to prove each unique bad/fix pair exists in the anchored history, the fix is the direct child of the bad commit, and declared ground-truth files are touched by the reviewed fix.

Promotion Provenance intentionally sees **4 historical transitions, not 7 evaluation views**. Insufficient variants do not create additional provenance transitions.

`Promotion Provenance` does not checkout or execute historical repository code, does not run reproduction commands, and does not receive model/API credentials. It is provenance evidence only; it is not `Promotion Corpus Qualification` and cannot prove bad-fails/fixed-passes behavior by itself.

## Historical execution authority

Historical repository code is untrusted code. Qualification and promotion workflows are manual and require explicit acknowledgement that historical code will execute without an OS sandbox.

Historical reproduction runs receive an allowlisted environment only. In particular they do **not** inherit `OPENAI_API_KEY`, GitHub tokens, SSH agent state, cloud credentials, or arbitrary host environment variables. HOME, XDG config, global Git config, and npm user config are redirected to the temporary case directory; Git credential prompting is disabled.

The model process is a separate authority domain. Protected model credentials are available only to the Codex execution path after controller-side historical evidence has been collected. Historical reproduction is not rerun under the model credential environment.

This isolation reduces secret exposure but is still not an OS sandbox. Use disposable runners/containers for repositories that are not fully trusted.

## Manual workflows

### Promotion Corpus Qualification

`Promotion Corpus Qualification` requires no model credential. It validates the manifest, materializes each unique reviewed transition once, proves bad-fails/fixed-passes, and emits `PROMOTION_CORPUS_QUALIFICATION.json`. Insufficient variants reuse that qualified transition and do not execute the same history again merely to inflate evidence counts.

### Promotion Model Evaluation

`Promotion Model Evaluation` additionally requires `CODEX_DEBUG_CANARY_OPENAI_API_KEY` (preferred) or `OPENAI_API_KEY` plus explicit historical-execution acknowledgement. It supports optional fixed hypothesis/verifier models; an empty model uses Safe Core `auto` routing.

`promotion_mode=false` runs calibration. `promotion_mode=true` fails before model execution unless readiness is satisfied and the manifest is explicitly reviewed to `promotionEligible=true`.

The workflow has `contents: read` only, uses SHA-pinned Actions, and performs no repository write, patch apply, commit, push, release, publication, or lifecycle promotion.

## Metrics

The evaluator records causal-assessment accuracy, root-cause term hit rate, insufficient-evidence accuracy, false support, false-fix candidates, patch-policy violations, both model phases' token usage, and tokens per evaluation case. Safety-critical counts fail closed in live workflows. Token usage is recorded for calibration; no promotion token-efficiency threshold is claimed yet.

## Claim boundary

Currently allowed statements include:

- Model Evaluation Record v1 exists and is deterministically tested.
- Promotion Corpus v2 and summary-only insufficient-evidence projection are implemented and fail closed.
- Four unique reviewed direct-parent transitions span Codex Debug, Safe Core, and Codex Diagnose.
- Three authentic insufficient variants are attached to those real transitions without inflating the reviewed-case floor.
- Current structural coverage is `4/12` cases, `3/3` repositories, `4/4` failure kinds, `3/3` insufficient variants, and `7` evaluation views.
- Continuous CI proves reviewed Git provenance without executing historical code.

The following statements are **not** allowed until corresponding artifacts exist:

- the promotion corpus is ready;
- live RCA precision meets a production target;
- live insufficient-evidence accuracy meets a production target;
- false-fix rate is production-proven across real repositories;
- live token efficiency is calibrated at production scale;
- Codex Debug Safe is ready to move from `development` to `active`.
