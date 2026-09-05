# Security

## Threat model

Every failure input may be attacker controlled: logs, source snippets, commit subjects, filenames, test reports, SARIF/JUnit, core files, debugger output, platform dumps, performance traces and audio artifacts. Inputs may contain prompt injection, ANSI/control sequences, secrets, malicious paths, fake tool results, or instructions designed to gain execution authority.

Historical repository code is also untrusted when Safe Bisect is used.

## Invariants

- Model prompts label evidence and prior model output as untrusted data.
- Safe Core performs ANSI cleanup and common credential redaction before model context construction.
- Raw files and compact model evidence are independently byte bounded.
- Raw core/WAV/performance artifacts are summarized rather than blindly embedded.
- Model output has no command, debugger, network, patch-apply, commit, push, merge, release, CI-retry or publication authority.
- Reproduction and verification commands execute only when explicitly supplied by the caller.
- Historical execution additionally requires `--allow-historical-execution` or the VS Code modal approval path.
- Safe Bisect uses an isolated temporary clone, cleans candidate worktrees between checkouts, verifies good/bad endpoint behavior and fails closed on ambiguous/flaky results.
- A patch is inert unless the caller explicitly applies it.
- Patch paths reject traversal, absolute paths, `.git`, binary patches and `src/codex-safe-core`; `git apply --check --whitespace=error-all` is mandatory.
- A successful unbound command never upgrades a fix to `verified`.
- Stored sessions are validated against receipt-bound evidence/investigation/ledger/verification digests before resume.
- VS Code execution surfaces require Workspace Trust.
- Provider secret values are sourced through environment/auth configuration and are not accepted as CLI secret values.

## Core dump / debugger hardening

A core file and its matching executable are untrusted native inputs to GDB/LLDB. Codex Debug Safe therefore uses fixed debugger commands only:

- GDB runs batch mode without normal init files, disables auto-load and debuginfod, and receives `DEBUGINFOD_URLS` cleared.
- LLDB runs without the user init file and disables symbol-file script loading.
- the model cannot supply `-ex`, `-o`, Python, command files or plugin-load arguments;
- debugger output is bounded before being retained or sent to a model.

This reduces attack surface but does not make a native debugger a sandbox. Analyze hostile core/executable pairs only on a machine/container with an appropriate trust boundary.

## Historical execution warning

`--allow-historical-execution` means exactly what it says: the caller authorizes their explicit reproduction command to run against older repository content. An isolated clone protects the working tree from direct mutation but is **not an OS sandbox**. Historical code and build scripts may execute with the current process permissions and environment. Use a disposable runner/container when repository history is not fully trusted.

## Session and evidence privacy

Local sessions may contain compacted logs, source snippets and model conclusions and are stored under `.codex-debug/sessions/` with private file permissions where supported. Do not commit this directory. Debug Receipts contain digests/metadata rather than raw large artifacts, but local sessions are still potentially sensitive engineering data.

## Development baseline limitations

The current baseline is not yet an `active` Family release. Native debugger parsing, platform parsers and artifact parsers have deterministic/adversarial tests, but there is not yet a production-scale recorded model RCA corpus or sandboxed historical executor. Those are explicit promotion gaps, not implied guarantees.

## Reporting vulnerabilities

Do not include real API keys, private logs, proprietary source, production core dumps or customer data in public issues. Provide minimized sanitized fixtures.
