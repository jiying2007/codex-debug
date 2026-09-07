# Immutable Release Authority

Codex Debug Safe keeps immutable release authority separate from development CI and from Promotion Model Evaluation.

The checked-in `.github/workflows/immutable-release.yml` is deliberately dormant and manual-only. Its presence during the `development` lifecycle does not grant release authority: a run refuses immediately unless the checked-out `main` commit has `product-contract.json.lifecycle=active` and the operator explicitly supplies both a successful promotion run id and `acknowledge_immutable_release=true`.

## Required ordering

1. Complete calibration, reviewed Admission Policy, reviewed Governance Lock and `promotionEligible=true`.
2. Run `Promotion Model Evaluation` with `promotion_mode=true` on main and retain the successful promotion artifact.
3. Create one activation commit whose single parent is that promotion source SHA.
4. The activation commit may change only:
   - `product-contract.json`: `lifecycle` from `development` to `active`, with every other Product Contract field byte-equivalent as JSON;
   - `ROADMAP.md`: only the existing `Family promotion development -> active and immutable release workflow` checkbox from `[ ]` to `[x]`.
5. Require the active commit's normal `CI Gate` to complete successfully.
6. Manually run `Immutable Release` from `main`, supplying the promotion run id and explicit immutable-release acknowledgement.

Any other commit between promotion and activation invalidates the promotion evidence for release.

## Release-time revalidation

The release authority job is read-only. It verifies:

- the selected run is a successful `Promotion Model Evaluation` `workflow_dispatch` on `main`;
- its head SHA is the active commit's only direct parent;
- the activation diff is exactly the two allowed lifecycle surfaces above;
- the active Product Contract is `lifecycle=active`;
- the active SHA has exactly one successful `CI Gate` produced by GitHub Actions App `integration_id=15368`;
- the retained promotion bundle contains Governance Lock/Receipt, Promotion Qualification v1, model evidence, reviewed Admission Policy, ready Promotion Admission v2 and Calibration Report;
- the promotion artifact policy and Governance Lock exactly match the checked-in reviewed policy/lock;
- Promotion Admission v2 independently reconstructs as ready with `requirePromotionEligible=true` against the promotion source SHA and current Safe Core;
- live repository governance still matches the reviewed lock at release time, including stable `refs/heads/main`, source-bound `CI Gate`, strict status checks, PR-only flow, no force-push/deletion bypass and the reviewed no-bypass-actors lock.

The authority job emits digest-bound `RELEASE_AUTHORITY.json`. It never tags or publishes.

## Permission boundary

Top-level workflow permissions and the authority/package jobs are read-only (`contents: read`, `actions: read`). Only the final `publish` job receives `contents: write`, `id-token: write`, and `attestations: write`, and that job runs only after authority validation and reproducible packaging have succeeded.

The workflow never accepts Marketplace, npm, OVSX or VSCE credentials. It publishes only an immutable GitHub tag/release; Marketplace publication remains a separate decision.

## Release payload

Packaging repeats the reproducible VSIX contract and retains:

- `codex-debug-safe-<version>.vsix`;
- `SBOM.spdx.json`;
- `CONSUMER_CI_RECEIPT.json`;
- `RELEASE_AUTHORITY.json`;
- `RELEASE_REPOSITORY_GOVERNANCE.json`;
- `SHA256SUMS`.

The final publish job re-verifies `SHA256SUMS`, creates a build-provenance attestation, ensures `v<version>` points to the exact active SHA, and refuses to overwrite an existing GitHub Release.

While the repository remains `development`, this workflow is intentionally non-executable as release authority.
