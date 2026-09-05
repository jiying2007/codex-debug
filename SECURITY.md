# Security

## Threat model

Failure evidence is attacker-controlled input. Logs can contain prompt injection, terminal escape sequences, secrets, malicious filenames, bogus commands, fake tool results, and instructions designed to induce repository mutation. Commit subjects and source metadata are also untrusted.

## Invariants

- Model prompts explicitly label all evidence as untrusted data.
- Safe Core performs ANSI cleanup and common credential redaction before model context construction.
- Raw file evidence is byte bounded; compact model evidence is independently bounded.
- Model output has no command/tool authority.
- A reproduction or verification command executes only when explicitly entered by the user/CLI caller.
- A patch is inert unless `--apply` or the explicit VS Code apply command is used.
- Patches reject traversal, absolute paths, `.git`, binary changes, and `src/codex-safe-core` mutation.
- Every applied patch must pass `git apply --check --whitespace=error-all` first.
- Codex Debug Safe never commits, pushes, merges, creates releases, retries pipelines, or publishes remote comments.
- Workspace trust is mandatory for VS Code execution surfaces.
- Provider secrets are referenced by environment/config source; values are not accepted as CLI flags.

## Known development-baseline limitations

The current parser is intentionally deterministic and conservative, not a full symbolic debugger. Stack symbolization, core-file parsing, device transport, and trace acquisition adapters are follow-on modules. Shell reproduction commands inherit the user's shell environment; they are explicit user authority and therefore should be treated with the same care as typing the command in a terminal.

## Reporting vulnerabilities

Do not include real API keys, private logs, proprietary source, or production crash dumps in public issues. Provide a minimized reproduction or sanitized fixture.
