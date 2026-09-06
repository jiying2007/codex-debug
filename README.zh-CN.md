# Codex Debug Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Codex Debug Safe 是 Codex Safe 产品族中的**证据驱动工作区 Debug、因果验证、受控修复、回滚与真实修复验证产品**。它从真实 failure 出发，但不会把模型置信度当作证据。

`codex-diagnose` 继续保持 CI/build/test 的有界只读诊断；`codex-debug` 负责工作区里的“复现 → 因果调查 → 修复 → 验证”闭环，并把每一种执行权限分开管理。

## 当前生命周期

当前 Product Contract 明确为 `lifecycle: development`。Debug 作为 development Family consumer 可以继承 Safe Core 身份和治理规则，但**不会参与正式 Family freshness / snapshot / release readiness**。只有未来显式切换到 `active` 才进入正式发行链；当前仓库故意不提供 Release workflow。

## 首版能力

- build/link、unit/integration test failure；
- native crash、core dump、固定命令 GDB/LLDB backtrace；
- ASAN/TSAN/UBSAN/LSAN/Valgrind、race/deadlock/OOM/watchdog；
- Linux kernel panic/Oops/call trace、Android ANR/tombstone、Cortex-M fault register、RTOS task/stack；
- Cortex-M `PC/LR → symbol`：支持 bounded linker map 解析和固定 argv 的 GNU/LLVM embedded `addr2line`；ELF `file:line` 会继续进入源码窗口、blame/history 和 test-impact；
- SARIF、JUnit、WAV 声学指标、Perfetto/Chrome trace；
- Git HEAD/status/内容状态指纹、源码窗口、blame/history、causal commit candidates；
- 复用 Safe Core test-impact 的 regression-test candidates；
- 两阶段模型：竞争假设 → Independent Causal Verification；
- 有界 unified diff，默认完全 inert；
- 多轮 reproduction / verification 统计以及 failure-transition 分类；
- 每个候选独立 clone 的 **first-parent** Safe Bisect，并且必须显式允许 historical execution；
- append-only、证据绑定的 session + self-digested Debug Receipt lineage；
- drift-safe patch snapshot 与 rollback；
- CLI 与 VS Code 共用同一引擎。

## 权限边界

```text
failure / artifact / core / firmware symbols   不可信数据
              ↓
redact / bound / parse / digest
              ↓
只读源码和 Git Evidence
              ↓
模型生成竞争假设                         只有建议权
              ↓
第二阶段独立因果验证                     只有建议权
              ↓
verifier 接受的 patch                    仍然 inert
              ↓
只有用户显式授权：
  ├─ --command
  ├─ --allow-historical-execution
  ├─ --apply / --apply-session
  ├─ --rollback-session
  └─ --verify-command
              ↓
真实 before/after execution evidence + Debug Receipt
```

日志、源码、commit subject、debugger/symbolizer output、artifact summary、文件名和平台 dump 全部视为**不可信数据而不是指令**。模型不能执行命令、决定 symbolizer argv、apply/rollback patch、commit/push/merge、retry CI、发布 Release，也不能自行把 hypothesis 标成 `confirmed`。

## `verified` 的严格含义

进入 `verified` 必须同时满足：

1. 产品通过显式 reproduction command 真实观察到失败；
2. baseline 足够可重复：单次 `1/1` 失败，或多轮中至少两次失败共享同一归一化 failure signature；
3. baseline 后产品独立观察到 workspace 内容状态发生变化；
4. 有界 post-change verification 所有轮次全部通过；
5. stored session 的 evidence / investigation / ledger / verification / patch-state / lineage digest 全部仍然匹配。

因此“给一个 crash.log，再跑一个无关绿色测试”最多只是 `passed-unbound`。Runtime verification 还会记录 failure transition：`resolved`、`same-failure`、`different-failure`、`mixed-failure` 或 unbound。

**修复进入 `verified` 并不自动等于根因 hypothesis 被确认。** `verified` 只证明工作区发生变化后，原先可重复的 failure 在绑定的验证中消失；只有已经被因果 verifier 标成 `supported` 的 hypothesis，才能在后续 runtime verification 成功后升级成 `confirmed`。因此 deterministic-only 模式可以证明“这个改动解决了故障”，但不会凭空制造“为什么解决”的根因结论。

## 常用 CLI

```bash
codex-debug --log build.log
codex-debug --command "npm test" --repro-runs 3
codex-debug --core core.1234 --executable ./build/app --debugger auto
```

GDB 固定关闭 init/auto-load/history/debuginfod，LLDB 固定关闭用户 init 与 symbol-file script loading；模型不能提供 debugger command。

Cortex-M map / ELF 符号化：

```bash
codex-debug \
  --log hardfault.log \
  --map build/firmware.map \
  --elf build/firmware.elf \
  --addr2line arm-none-eabi-addr2line
```

只有从 fault evidence 中由控制器解析出来的 `PC/LR` 才会传给固定的 `addr2line -f -C -e ELF <addresses...>`；模型不能填地址、工具名或附加参数。支持固定枚举的 `arm-none-eabi-addr2line`、常见 RISC-V GNU 名称、`llvm-addr2line` 与 host `addr2line`。只有 map 时也能确定性得到最近 symbol + offset。ELF 的 `file:line` 只有在安全解析到当前 workspace 内时才用于源码/历史/回归候选。

Safe Bisect：

```bash
codex-debug \
  --command "npm test -- --runInBand" \
  --repro-runs 2 \
  --bisect-good v1.2.0 \
  --bisect-bad HEAD \
  --allow-historical-execution
```

它会先证明 good endpoint 通过、bad endpoint 可重复失败，然后只在有界 first-parent 路径上二分。每个 candidate 都使用全新的临时 clone、独立 HOME/Git config，并默认移除常见 credential-like 环境变量；但这**仍然不是 OS sandbox**。混合/不稳定结果直接 fail-closed。`firstBad` 只证明 failure transition，不自动证明具体错误行或机制。

人工修改代码后恢复原 failure session：

```bash
codex-debug \
  --resume dbg-0123456789abcdef \
  --verify-command "npm test" \
  --verify-runs 5
```

显式应用 persisted patch 和回滚：

```bash
codex-debug --apply-session dbg-0123456789abcdef
codex-debug --rollback-session dbg-fedcba9876543210
```

`--apply-session` 必须先证明当前 workspace 内容状态仍与 evidence-time fingerprint 一致，并重新检查 stored patch 仍然满足 causal verifier 的 `supported + accept`，然后才通过 patch check 并在 `.codex-debug/snapshots/` 建立私有有界快照。`--rollback-session` 只恢复记录过的 patch paths；如果其中任一文件在 apply 后又被修改，会直接拒绝 rollback，绝不覆盖用户后续修改。

`.codex-debug` 是产品私有状态，因此不进入“用户代码 workspace freshness”指纹；session append-only，session/snapshot 自身仍通过独立 digest 防篡改。

## Patch 门禁

模型 patch 默认不修改文件。只有显式 `--apply`、`--apply-session` 或 VS Code Apply 命令才允许修改。必须通过文本/256KiB/仓库相对路径/Git-native 路径解析/path traversal/binary/rename-copy/`git apply --check` 等门禁，并拒绝 `.git`、`.codex-debug`、`src/codex-safe-core`、GitHub workflow/control-plane、`.env`/key、generated/vendor/build/dependency output。Snapshot/rollback 进一步拒绝 symlink/junction traversal、symlink/非普通文件和 hardlink。

Codex Debug Safe 永远不会自动 commit、push、merge、创建 PR/MR、retry pipeline 或发布 Release。

## VS Code

当前命令包括：Debug Selected Failure Evidence、Debug Failure Log File、Debug Core Dump、Debug Reproduction Command、Run Safe Bisect、Apply Last Proposed Patch、**Rollback Last Applied Patch**、Verify Last Fix、Resume Debug Session and Verify、Show Debug Session、Check Debug Environment、Show Debug Output。

Workspace trust 必须启用；historical execution、apply、rollback 都需要显式用户动作。

## Token / Evidence 效率

Raw log 不会整块直接送入模型。Safe Core 先做 ANSI/credential cleanup、significant-window selection、duplicate folding 和 byte bound；Debug 再加入有限的 frame、platform/symbol summary、source window、artifact summary、Git candidate、Safe Bisect metadata 与 regression-test candidate。Raw core、ELF、map、WAV、trace 都不会直接嵌入 prompt。当前 CI 已有 deterministic context-byte/compaction benchmark，在有 live-model token 指标前先锁住输入效率底线。

## 与 Safe 族关系

```text
Review   → 修改有没有风险
Diagnose → CI/build/test 为什么失败（只读）
Debug    → failure 的因果调查、受控修复、rollback 与 before/after 验证
Commit   → 安全提交
Change   → PR/MR 交付
```

当前 `0.1.0` 仍是 development baseline，不代表 Marketplace/Release ready。
