# Security

## Threat model

Every failure input may be attacker controlled: logs, source snippets, commit subjects, filenames, test reports, SARIF/JUnit, core files, ELF images, linker maps, debugger/symbolizer output, platform dumps, performance traces and audio artifacts. Inputs may contain prompt injection, ANSI/control sequences, secrets, malicious paths, malformed binary data, fake tool results, or instructions designed to gain execution authority. Historical repository code is also untrusted when Safe Bisect is used.

## Invariants

- Model prompts label evidence and prior model output as untrusted data.
- Safe Core performs ANSI cleanup and common credential redaction before model context construction.
- Raw files and compact model evidence are independently byte bounded; raw core/ELF/map/WAV/performance artifacts are summarized rather than blindly embedded.
- Model output has no command, debugger/symbolizer, network, patch-apply/rollback, commit, push, merge, release, CI-retry or publication authority.
- Reproduction and verification commands execute only when explicitly supplied by the caller.
- Historical execution additionally requires `--allow-historical-execution` or the VS Code modal approval path.
- A persisted patch is usable only when the stored investigation still records `rootCauseAssessment=supported` and `patchDisposition=accept`; a locally recomputable Receipt is never treated as execution authority.
- Patch paths reject traversal, absolute paths, `.git`, `.codex-debug`, binary patches and `src/codex-safe-core`; rename/copy patches are rejected by the current rollback contract.
- GitHub workflow/control-plane paths, `.env`/key material and generated/vendor/build/dependency outputs are protected from model patch application by default.
- `git apply --check --whitespace=error-all` is mandatory before mutation.
- Applying a persisted patch requires the current workspace content-state fingerprint to match the evidence-time state; stale model patches fail closed.
- Applied paths are privately snapshotted before mutation. Symlink/junction parents, symlink targets, non-regular files and hard-linked files are rejected.
- Rollback verifies every current target still equals its recorded post-patch identity before staging any restore. User edits after apply cause refusal instead of overwrite.
- Successful rollback is itself append-only state: it creates a new child session and new Debug Receipt rather than mutating the applied/verified parent.
- A completed rollback child cannot retain `verified` or `applied-unverified`; it returns to `proposed` because the current workspace no longer contains the applied fix.
- Rollback patch/verification/lineage facts are cross-bound and validated; a rollback child cannot consume the same snapshot again (`EROLLBACKCONSUMED`).
- `.codex-debug` product-private state is excluded from the user-code freshness fingerprint, but session/snapshot files have separate integrity digests and path hardening.
- Sessions are append-only: an existing session ID is never overwritten. Session IDs include random entropy, and session directories/files reject symlink/hardlink aliasing.
- Debug Receipts self-digest metadata and bind evidence, investigation, ledger, verification, patch state and lineage. Receipts are integrity records, not signatures from a remote trust authority.
- Automatic source-window/test-impact reads remain inside the workspace real path and reject symlink/junction escape.
- A successful unbound command never upgrades a fix to `verified`.
- A verified fix does not automatically confirm a root-cause hypothesis; only a verifier-supported hypothesis may transition to `confirmed` when runtime evidence also succeeds.
- VS Code execution surfaces require Workspace Trust.
- Provider secret values are sourced through environment/auth configuration and are not accepted as CLI secret values.
- While lifecycle is `development`, CI enforces a publication boundary: no release/publish workflow, `pull_request_target`, write-level contents/packages/id-token permission, npm/vsce/ovsx publish, GitHub release, or Git push surface may appear.

## Core dump / debugger hardening

A core file and its matching executable are untrusted native inputs to GDB/LLDB. Codex Debug Safe uses fixed debugger commands only:

- core/executable inputs must be regular non-symlink files;
- GDB runs batch mode without normal init files, disables auto-load and debuginfod, clears `DEBUGINFOD_URLS`, and disables history persistence;
- LLDB runs without the user init file and disables symbol-file script loading;
- the model cannot supply debugger commands, Python, command files or plugin-load arguments;
- debugger output is bounded before retention/model context;
- workspace source prefixes are converted to relative paths and host-private prefixes are redacted.

A real Linux CI fixture compiles a DWARF-enabled crashing binary, drives it to SIGSEGV under GDB, creates an actual core with `generate-core-file`, and requires `symbolizeCore()` to recover the crash function/source while preserving host-path redaction. This reduces attack surface but does not make a native debugger a sandbox.

## Embedded ELF / map symbolization hardening

Firmware ELF and linker-map files are untrusted parser inputs. Embedded symbolization never executes firmware and never lets model output select addresses or append tool arguments.

- only controller-parsed Cortex-M `PC/LR` values are eligible;
- linker-map parsing is deterministic and bounded;
- ELF symbolization uses fixed `addr2line -f -C -e ELF <PC/LR...>` arguments;
- tool names are restricted to a fixed allowlist;
- ELF/map inputs must be bounded regular non-symlink files;
- symbolizer output is bounded and treated as untrusted evidence;
- `DEBUGINFOD_URLS` is cleared;
- `--source-prefix-map OLD=TARGET` requires absolute OLD and a TARGET inside the workspace; at most eight mappings are accepted;
- mappings change path interpretation only and never grant source-read authority;
- normalized `file:line` enters source/blame/history/test-impact only after workspace containment.

A real GNU Arm Embedded fixture validates `arm-none-eabi-as/ld/nm/addr2line`, linker-map resolution, DWARF source-prefix remap and source-context binding without executing firmware.

## Android tombstone symbol hardening

Android tombstone modules may be paired with explicit local symbols using repeatable `--android-symbol MODULE=ELF` mappings.

- symbol ELF inputs must be bounded regular non-symlink files;
- the tombstone frame must contain a BuildId before local source resolution is permitted;
- fixed `readelf -n` extracts the local ELF BuildId with debuginfod disabled;
- missing tombstone BuildId, missing local BuildId, or mismatch fails closed and **does not invoke addr2line**;
- only exact BuildId match may reach fixed `addr2line -f -C -e ELF <pc>`;
- retained metadata stores basename, size and SHA-256 digest rather than the local absolute path;
- resolved `file:line` enters source/blame/history/test-impact only through workspace containment.

The Linux CI fixture builds a real DWARF shared object with `--build-id=sha1` and proves match/mismatch/missing-id behavior through the production platform symbolizer.

## Kernel System.map / KASLR hardening

`System.map` contains link-time base-kernel addresses while Oops RIP/PC and call-trace addresses may be KASLR-shifted runtime addresses. Treating those spaces as identical can yield convincing but wrong symbols, so base-kernel resolution fails closed unless the slide is proven.

- `System.map` must be a bounded regular non-symlink file and its SHA-256 digest is retained;
- kernel addresses stay hexadecimal strings and are transformed with `BigInt`;
- deterministic `Kernel Offset: 0x... from 0x...` log evidence may prove the slide;
- callers may explicitly provide `--kernel-kaslr-slide 0xHEX`;
- if log and explicit slides both exist they must exactly match or resolution stops with `EKASLRMISMATCH`;
- underflow is `slide-underflow`;
- without proof, non-module frames are `kaslr-unproven` and **no nearest-lower System.map lookup is performed**;
- known-disabled KASLR still requires explicit `0x0` unless the log proves zero;
- evidence/reporting keeps `runtimeAddress`, `linkAddress`, `slide` and `slideSource` separate;
- loadable-module frames are never resolved through base-kernel `System.map`.

The real-format fixture uses a non-zero slide and separately covers missing proof, explicit/log mismatch and module-frame refusal.

## Kernel module BuildId hardening

Loadable-module identity is a separate trust domain from base-kernel KASLR identity. A local file with the same module name is **not** sufficient evidence.

Repeatable `--kernel-module-symbol MODULE=ELF` mappings may resolve a module frame only when the supplied Oops/stack trace carries an identity-bearing kernel `%pSb/%pBb`-style module tag such as `function+0x10/0x20 [vendor_mod <build-id>]`.

The enforced order is:

1. parse logged module name, exact function, function offset/size, and logged BuildId;
2. require an explicit module-to-ELF mapping;
3. inspect the local ELF with fixed `readelf -n`;
4. require exact logged/local BuildId equality;
5. only after equality, use fixed host `nm` to find the **exact logged function symbol**;
6. add the logged function offset to the local relocatable ELF symbol address;
7. pass only that address through fixed host `addr2line`;
8. accept `file:line` only after workspace containment.

Fail-closed states are explicit:

- no module mapping: `module-symbol-file-missing` / legacy `module-map-required`;
- local mapping exists but the log has no BuildId: `module-build-id-required`;
- local BuildId missing/unavailable: unresolved;
- BuildId mismatch: `module-build-id-mismatch`;
- exact logged function absent: unresolved; there is no nearest-symbol fallback;
- only `buildIdMatch=true` with `status=resolved` can feed source/blame/history/test-impact.

No `nm`/`addr2line` resolution is allowed before BuildId equality. The model cannot provide tool arguments. Host symbol-tool allowlists deliberately exclude embedded cross tools. Retained evidence stores local module basename, size and SHA-256 digest, not its absolute host path.

The executable Linux gate builds a real ET_REL `.ko`-style file via `cc -g -O0 -c` plus `ld -r --build-id=sha1`, then requires production `readelf → nm → function+offset → addr2line → workspace source` resolution. The same fixture proves wrong BuildId and missing logged BuildId remain unresolved.

## Historical execution warning

`--allow-historical-execution` authorizes the exact caller-supplied reproduction command to run against older repository content. Each tested commit gets a fresh temporary clone. Historical commands receive isolated HOME/global Git config and common credential-like environment variables (`TOKEN`, `SECRET`, `PASSWORD`, `API_KEY`, `PAT`, cloud credential variables and SSH agent state) are removed by default.

This is still **not an OS sandbox**. Historical code can execute with the current process identity and access resources not removed by the environment policy. Use a disposable runner/container when repository history is not fully trusted.

## Patch snapshot and receipt-bound rollback safety

`--apply-session` and the VS Code Apply command snapshot only validated patch paths. The snapshot records original bytes plus expected post-apply identity. `--rollback-session` restores only if every target still matches the expected post-patch identity.

Rollback rejects path traversal, internal product state, symlink/junction traversal, symlink targets, non-regular targets and hard-linked files. Restore bytes are staged before mutation. A partial restore caused by an external race/filesystem failure is reported explicitly.

A successful rollback creates a **new child session**. The parent applied/verified session is immutable. `lineage.rollback` contains the operation kind, snapshot id, exact restored paths, rollback digest and before/after workspace state fingerprints; this is covered by `lineageDigest`. The child patch state records `applied=false`, `rolledBack=true`, snapshot/digest/paths and is covered by `patchStateDigest`. Verification records the same rollback snapshot/digest/after-state and is covered by `verificationDigest`.

Stored-session validation cross-checks those domains, so a locally recomputed but semantically inconsistent rollback record is rejected with `EDEBUGROLLBACKBINDING`. A completed rollback cannot retain `verified` or `applied-unverified`, and a rollback child cannot consume the old snapshot again (`EROLLBACKCONSUMED`). Drift refusal occurs before session creation, so a failed rollback cannot leave a receipt that falsely claims restoration.

The executable E2E proves `proposed → applied-unverified → verified → rollback child(proposed)`, persisted child Receipt validation, parent-fingerprint binding, rollback metadata tamper detection, duplicate-snapshot refusal, and the existing post-apply drift refusal.

## Session and evidence privacy

Local sessions and snapshots may contain compacted logs, source snippets, model conclusions and pre-patch file content. They live under `.codex-debug/` with private permissions where supported and must not be committed. Packaging gates exclude `.codex-debug`, tests, quality corpora, scripts and repository workflows from distributable artifacts.

Session files are append-only and self-bound through the Debug Receipt. This protects against accidental/stale mutation; it does not turn local JSON into an externally signed attestation.

## Development Consumer Evidence

The development CI produces a **Consumer Evidence artifact**, not a release. It has no tag or Marketplace/GitHub Release authority and runs with `contents: read` only.

- checkout mtimes are normalized to the validated commit epoch before VSIX creation;
- exact `@vscode/vsce@3.9.2` packages the same source twice and CI requires byte-identical SHA-256 values;
- VSIX contents are inspected for required runtime files and forbidden development/private surfaces;
- Safe Core generates `CONSUMER_CI_RECEIPT.json`, binding the exact validated CI SHA, Core gitlink/version/runtime/governance digests, Node contract and declared completed suites including `kernel-kaslr`, `kernel-module-buildid` and `rollback-receipt-lineage`;
- SHA-256 checksums cover the VSIX and Receipt;
- files are uploaded only as a short-retention GitHub Actions artifact; this is **not** an immutable release or signed publication.

The reproducibility proof is scoped to the normalized CI checkout and exact VSCE package version used by the gate. Active promotion must still decide whether to freeze the final packaging dependency graph.

## Development baseline limitations

The current baseline is not yet an `active` Family release. Deterministic/adversarial gates plus real Linux native-core, GNU Arm Embedded Cortex-M, BuildId-bound Android ELF, non-zero-KASLR System.map/Oops, BuildId-bound relocatable kernel-module and receipt-bound rollback-lineage fixtures are proven in CI. Promotion still requires a production-scale recorded live-model RCA corpus, broader native/minidump/firmware/Android/kernel/module corpora, explicit model canary, and the final Family active/release chain.

## Reporting vulnerabilities

Do not include real API keys, private logs, proprietary source, production core dumps, firmware images or customer data in public issues. Provide minimized sanitized fixtures.
