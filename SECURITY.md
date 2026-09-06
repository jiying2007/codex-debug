# Security

## Threat model

Every failure input may be attacker controlled: logs, source snippets, commit subjects, filenames, test reports, SARIF/JUnit, core files, ELF images, linker maps, debugger/symbolizer output, platform dumps, performance traces and audio artifacts. Inputs may contain prompt injection, ANSI/control sequences, secrets, malicious paths, malformed binary data, fake tool results, or instructions designed to gain execution authority.

Historical repository code is also untrusted when Safe Bisect is used.

## Invariants

- Model prompts label evidence and prior model output as untrusted data.
- Safe Core performs ANSI cleanup and common credential redaction before model context construction.
- Raw files and compact model evidence are independently byte bounded; raw core/ELF/map/WAV/performance artifacts are summarized rather than blindly embedded.
- Model output has no command, debugger/symbolizer, network, patch-apply/rollback, commit, push, merge, release, CI-retry or publication authority.
- Reproduction and verification commands execute only when explicitly supplied by the caller.
- Historical execution additionally requires `--allow-historical-execution` or the VS Code modal approval path.
- A persisted patch is usable only when the stored investigation still records `rootCauseAssessment=supported` and `patchDisposition=accept`; a locally recomputable Receipt is never treated as execution authority.
- Patch paths reject traversal, absolute paths, `.git`, `.codex-debug`, binary patches and `src/codex-safe-core`; rename/copy patches are rejected by the current rollback contract. Git-native `--numstat -z` parsing is used for exact Unicode/space-containing paths.
- GitHub workflow/control-plane paths, `.env`/key material and generated/vendor/build/dependency outputs are protected from model patch application by default.
- `git apply --check --whitespace=error-all` is mandatory before mutation.
- Applying a persisted patch requires the current workspace content-state fingerprint to match the evidence-time state; stale model patches fail closed.
- Applied paths are privately snapshotted before mutation. Symlink/junction parents, symlink targets, non-regular files and hard-linked files are rejected.
- Rollback verifies every current target still equals its recorded post-patch identity before staging any restore. Restore content is prepared under the private snapshot directory first; user edits after apply cause refusal instead of overwrite.
- `.codex-debug` product-private state is excluded from the user-code freshness fingerprint, but session/snapshot files have separate integrity digests and path hardening.
- Sessions are append-only: an existing session ID is never overwritten. Session IDs include random entropy, and session directories/files reject symlink/hardlink aliasing.
- Debug Receipts self-digest their metadata and bind evidence, investigation, ledger, verification, patch state and lineage. Receipts are integrity records, not signatures from a remote trust authority.
- Automatic source-window collection resolves real paths inside the Git root and rejects symlink/junction components, so an untrusted stack/debug path cannot escape the workspace through a link.
- Automatic test-impact candidate reads use regular non-symlink files contained by the workspace real path; linked external test content is ignored.
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
- the model cannot supply `-ex`, `-o`, Python, command files or plugin-load arguments;
- debugger output is bounded before being retained or sent to a model;
- workspace source prefixes are converted to relative paths, core/executable paths are reduced to basenames, and HOME prefixes are redacted before debugger output enters evidence/model context.

This reduces attack surface but does not make a native debugger a sandbox. Analyze hostile core/executable pairs only on a machine/container with an appropriate trust boundary.

## Embedded ELF / map symbolization hardening

Firmware ELF and linker-map files are untrusted parser inputs. Embedded symbolization never executes firmware and never lets model output select addresses or append tool arguments.

- only controller-parsed Cortex-M `PC` and `LR` values from the supplied failure evidence are eligible for symbolization;
- linker-map parsing is deterministic, bounded, and returns nearest symbol + offset only;
- ELF symbolization uses a fixed `addr2line -f -C -e ELF <PC/LR...>` template;
- tool names are restricted to a fixed allowlist covering common `arm-none-eabi`, RISC-V GNU, LLVM and host addr2line binaries;
- ELF/map inputs must be bounded regular non-symlink files;
- symbolizer output is bounded and treated as untrusted evidence, not instructions;
- `DEBUGINFOD_URLS` is cleared for addr2line execution;
- workspace `file:line` output is normalized to relative paths; absolute paths outside the workspace are reduced to `<external>/<basename>:line` before they enter Evidence/prompt;
- normalized `file:line` output is allowed to enter source/blame/history/test-impact only when workspace-bound source resolution accepts the path.

A real Linux `cc -g` + `nm` + `addr2line` fixture exercises the ELF/DWARF path in CI. This is useful host-toolchain evidence, but it is not yet a substitute for a real Cortex-M cross-toolchain corpus or source-prefix remapping from external firmware build roots.

ELF parsers are native tooling and may themselves contain vulnerabilities. Treat hostile firmware images like hostile core files and analyze them in an appropriate container/runner boundary when provenance is uncertain.

## Historical execution warning

`--allow-historical-execution` authorizes the exact caller-supplied reproduction command to run against older repository content. Each tested commit gets a fresh temporary clone instead of reusing a candidate worktree. Historical commands receive an isolated HOME/global Git config and common credential-like environment variables (`TOKEN`, `SECRET`, `PASSWORD`, `API_KEY`, `PAT`, cloud credential variables and SSH agent state) are removed by default.

This is still **not an OS sandbox**. Historical code can execute with the current process identity and can access resources not removed by the environment policy. Use a disposable runner/container when repository history is not fully trusted.

## Patch snapshot and rollback safety

`--apply-session` and the VS Code Apply command snapshot only validated patch paths. The snapshot records original bytes plus expected post-apply identity. `--rollback-session` restores only if every target still matches the expected post-patch identity.

The rollback implementation rejects path traversal, internal product state, symlink/junction traversal, symlink targets, non-regular targets and hard-linked files. Restore bytes are staged before mutation. If restoration nevertheless fails part-way because of an external race or filesystem failure, the operation reports an explicit partial-rollback error instead of claiming success.

## Session and evidence privacy

Local sessions and snapshots may contain compacted logs, source snippets, model conclusions and pre-patch file content. They live under `.codex-debug/` with private permissions where supported and must not be committed. Packaging gates exclude `.codex-debug`, tests, quality corpora, scripts and repository workflows from distributable artifacts.

Session files are append-only and self-bound through the Debug Receipt. This protects against accidental/stale mutation; it does not turn local JSON into an externally signed attestation.

## Development baseline limitations

The current baseline is not yet an `active` Family release. Native debugger/symbolizer parsing, platform parsers and artifact parsers have deterministic/adversarial tests, but there is not yet a production-scale recorded live-model RCA corpus, OS sandbox for historical execution, full minidump stack, real native core corpus, Cortex-M cross-toolchain corpus, or deep Android/kernel symbol resolver. Those are explicit promotion gaps, not implied guarantees.

## Reporting vulnerabilities

Do not include real API keys, private logs, proprietary source, production core dumps, firmware images or customer data in public issues. Provide minimized sanitized fixtures.
