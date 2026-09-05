# Codex Debug Safe Roadmap

The first release line is intentionally architecture-first. Marketplace publication is not the milestone; verified debugging quality is.

## Track A — Evidence adapters

- GDB/LLDB core + minidump metadata
- Linux kernel panic/Oops symbolized call traces
- Android tombstone + bugreport adapters
- MCU Cortex-M fault-register decoder and map/ELF symbolization
- JUnit/SARIF/CTest/Pytest structured evidence
- GitHub Actions/GitLab CI failed-job artifact ingestion
- perf/Perfetto/heap/CPU regression evidence
- audio dump metadata for AEC/NS/VAD/KWS pipelines

## Track B — Causal verification

- deterministic first-bad commit/bisect orchestration when a stable repro exists
- source-line causal anchors and blame history
- hypothesis-specific verification probes
- before/after failure fingerprint equivalence
- flaky reproduction statistics and confidence bounds
- mutation/regression tests for proposed fixes

## Track C — Repair safety

- changed-line patch budget
- protected/generated/vendor path policy
- workspace snapshot/rollback receipt
- staged-only patch mode
- test-impact selection through Safe Core
- explicit patch rejection reasons and coverage gaps

## Track D — Product surfaces

- VS Code session/hypothesis tree view
- local Debug Evidence report explorer
- CLI resume/continue workflow
- optional GitHub/GitLab adapters without embedding provider logic in Core
- Family Suite integration while preserving standalone SKU

## Track E — Quality platform

- recorded crash/build/test/sanitizer/kernel/MCU corpus
- root-cause precision and false-fix rate
- patch applicability rate
- verified-fix rate
- token/context bytes per resolved incident
- regression escape rate
- adversarial prompt-injection corpus

No metric is claimed until the corresponding recorded corpus and evaluator exist.
