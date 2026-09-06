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

A real Linux CI fixture compiles a DWARF-enabled crashing binary, drives it to SIGSEGV under GDB, creates an actual core with `generate-core-file`, and requires `symbolizeCore()` to recover the crash function/source while preserving host-path redaction. Linux runners must provide both `cc` and `gdb`; the fixture does not silently skip missing tooling.

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
- `--source-prefix-map OLD=TARGET` may remap DWARF paths from an external build/source root only when `OLD` is absolute and `TARGET` resolves inside the current workspace; at most eight mappings are accepted;
- source-prefix evidence stores a digest of the external prefix plus a workspace-relative target, never the external host path itself;
- a source-prefix mapping changes path interpretation only. It does not authorize reading a file: mapped paths still pass the normal workspace realpath/symlink containment checks before source snippets, blame, history or test-impact can consume them;
- normalized `file:line` output is allowed to enter source/blame/history/test-impact only when workspace-bound source resolution accepts the path.

A real Linux GNU Arm Embedded fixture uses `arm-none-eabi-as`, `arm-none-eabi-ld`, `arm-none-eabi-nm` and `arm-none-eabi-addr2line` to build a Cortex-M3 ELF with DWARF and a GNU linker map. The fixture injects an external build-root source path into DWARF, remaps it into workspace source, resolves controller-observed PC/LR, verifies linker-map symbol/offset resolution, and then requires mapped source to bind into the existing source-context pipeline. This proves the cross-toolchain path without executing firmware.

## Android tombstone symbol hardening

Android tombstone modules may be paired with explicit local symbols using repeatable `--android-symbol MODULE=ELF` mappings. These mappings are evidence inputs, not execution authority.

- symbol ELF inputs must be bounded regular non-symlink files;
- the tombstone frame must contain a BuildId before local source resolution is permitted;
- a fixed `readelf -n` inspection extracts the local ELF BuildId with debuginfod disabled;
- missing tombstone BuildId, missing local BuildId, or any BuildId mismatch fails closed for that frame and **does not invoke addr2line**;
- only an exact BuildId match may reach the fixed `addr2line -f -C -e ELF <pc>` template;
- retained symbol metadata stores module basename, ELF basename, size and SHA-256 digest, not the local absolute ELF path;
- resolved `file:line` enters source/blame/history/test-impact only through the same workspace containment and optional source-prefix rules used by embedded symbol evidence.

The Linux CI fixture builds a real DWARF shared object with `--build-id=sha1`, extracts its dynamic symbol address and BuildId using `nm`/`readelf`, synthesizes an Android-format tombstone frame, and proves the production platform symbolizer resolves source only for the matching BuildId. Mismatch and BuildId-missing cases are explicit negative fixtures.

## Kernel System.map hardening

Kernel Oops/panic evidence can be paired with an explicit `--kernel-system-map FILE` input. The resolver is deterministic: it parses bounded `System.map` rows and performs nearest-lower-symbol lookup over preserved 64-bit addresses.

- `System.map` must be a bounded regular non-symlink file and its SHA-256 digest is bound into platform evidence;
- kernel RIP/PC and call-trace addresses are kept as hexadecimal strings, avoiding JavaScript integer precision loss;
- only non-module frames are resolved through the supplied kernel `System.map`;
- any frame carrying `[module]` is marked `module-map-required` and remains unresolved, rather than pretending the base-kernel map covers loadable modules;
- this resolver does not execute `addr2line`, scripts, commands or text found in the log.

The current fixture uses real Linux Oops/System.map line formats and verifies 64-bit address offsets plus loadable-module refusal. It is evidence of the deterministic resolver, not a claim of complete KASLR/module/vmlinux support.

Native ELF/debugger tools are themselves parser attack surfaces. Treat hostile core/ELF/symbol inputs with an appropriate container/runner trust boundary when provenance is uncertain.

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

The current baseline is not yet an `active` Family release. Native debugger/symbolizer parsing and platform adapters now have deterministic/adversarial tests plus a real Linux native-core fixture, a real GNU Arm Embedded Cortex-M fixture, a real BuildId-bound Android ELF fixture, and a real-format kernel System.map/Oops fixture. Promotion still requires a production-scale recorded live-model RCA corpus, broader native/minidump/firmware/Android/kernel corpora, module/KASLR handling, reproducible VSIX/Consumer CI evidence, and the final Family release chain.

## Reporting vulnerabilities

Do not include real API keys, private logs, proprietary source, production core dumps, firmware images or customer data in public issues. Provide minimized sanitized fixtures.
