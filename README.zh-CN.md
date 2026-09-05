# Codex Debug Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Codex Debug Safe 是 Codex Safe 产品族中的**证据驱动工作区 Debug、因果验证、受控修复与真实修复验证产品**。它从一个真实 failure 出发，但不会把模型置信度当作证据。

`codex-diagnose` 继续保持“CI/build/test 的有界只读诊断”；`codex-debug` 负责工作区里的“复现 → 因果调查 → 修复 → 验证”闭环，并把每一种执行权限分开管理。

## 当前生命周期

当前 Product Contract 明确是 `lifecycle: development`。Safe Core 已把 Debug 注册为 development consumer，因此可以继承 Family 身份和治理规则，但**不会参与正式 Family freshness / snapshot / release readiness**。未来只有显式切换到 `active` 才进入正式发行链；当前仓库也故意不提供 Release workflow，避免开发阶段误发布。

## 首版已经铺开的能力

- build/link、unit/integration test failure；
- native crash、core dump、固定命令 GDB/LLDB backtrace；
- ASAN/TSAN/UBSAN/LSAN/Valgrind、race/deadlock/OOM/watchdog；
- Linux kernel panic/Oops/call trace 结构化摘要；
- Android logcat/ANR/tombstone ABI、signal、线程和 native frame 摘要；
- Cortex-M HardFault/BusFault/UsageFault 寄存器解码以及 map/text evidence；
- RTOS task/stack/assert 信号；
- dependency/infra、performance/latency；
- WAV 声学指标、SARIF、JUnit、Perfetto/Chrome trace；
- Git HEAD/status/内容状态指纹、源码窗口、blame/history、causal commit candidates；
- 复用 Safe Core test-impact 的回归测试候选；
- 两阶段模型：Hypothesis Generation → Independent Causal Verification；
- 有界 unified diff，默认完全 inert；
- 确定性 patch 校验之后仍需用户显式 apply；
- 多轮 reproduction / verification 统计；
- 隔离临时 clone 的 first-parent Safe Bisect，并且必须显式允许 historical execution；
- 可恢复、证据绑定的本地 session + Debug Receipt v1；
- CLI 与 VS Code 共用同一引擎。

## 权限边界

```text
failure / artifact / core dump           不可信数据
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
  --command
  --allow-historical-execution
  --apply
  --verify-command
              ↓
真实 before/after execution evidence
              ↓
Debug Receipt
```

日志、源码、commit subject、debugger output、artifact summary、文件名、平台 dump 全部视为**不可信数据而不是指令**。模型不能执行命令、应用 patch、commit/push/merge、retry CI、发布 Release，也不能自行把 hypothesis 标成 `confirmed`。

## `verified` 的严格含义

“某个命令执行成功”并不等于修复已验证。进入 `verified` 必须同时满足：

1. 产品通过显式 reproduction command 真实观察到失败；
2. baseline 具有足够可重复性：单次 `1/1` 失败，或多轮中至少两次失败且共享同一归一化 failure signature；
3. baseline 之后产品独立观察到 workspace 内容状态发生变化；
4. 有界 post-change verification 所有轮次全部通过；
5. resume 时原 session 的 evidence / investigation / ledger / verification receipt 绑定仍有效。

因此“给一个 crash.log，再跑一个无关的绿色测试”最多只能是 `passed-unbound`，绝不能是 `verified`。

## 常用 CLI

```bash
codex-debug --log build.log --markdown debug-report.md --output debug-session.json
codex-debug --command "npm test" --repro-runs 3
adb logcat -d | codex-debug --kind android
codex-debug --log sanitizer.log --deterministic-only
```

Core dump：

```bash
codex-debug --core core.1234 --executable ./build/app --debugger auto
```

GDB 固定关闭 init/auto-load/debuginfod，LLDB 固定关闭用户 init 与 symbol-file script loading；模型不能提供 debugger command。

结构化 artifact：

```bash
codex-debug --log failure.log \
  --artifact sarif:reports/asan.sarif \
  --artifact junit:reports/junit.xml \
  --artifact perf:trace.json \
  --artifact wav:capture.wav
```

Safe Bisect：

```bash
codex-debug \
  --command "npm test -- --runInBand" \
  --repro-runs 2 \
  --bisect-good v1.2.0 \
  --bisect-bad HEAD \
  --allow-historical-execution
```

它会先证明 good endpoint 通过、bad endpoint 可重复失败，然后只在有界 first-parent 路径上二分。混合/不稳定结果直接 fail-closed。`firstBad` 只证明这条 reproduction 在该 commit 边界发生失败转换，并不自动证明具体错误行或错误机制。

人工修改代码以后可以恢复原 failure session：

```bash
codex-debug \
  --resume dbg-0123456789abcdef \
  --verify-command "npm test" \
  --verify-runs 5
```

Session 统一存放在 Git root 的 `.codex-debug/sessions/`，即使 VS Code 只打开仓库中的子目录也不会查错位置。

## Patch 门禁

模型 patch 默认不修改任何文件。只有显式 `--apply` 或 VS Code Apply 命令才允许修改，而且必须先通过文本/256KiB/仓库相对路径/path traversal/`.git`/binary/`src/codex-safe-core`/`git apply --check --whitespace=error-all` 门禁。

Codex Debug Safe 永远不会自动 commit、push、merge、创建 PR/MR、retry pipeline 或发布 Release。

## VS Code

当前命令包括 Debug Selected Failure Evidence、Debug Failure Log File、Debug Core Dump、Debug Reproduction Command、Run Safe Bisect、Apply Last Proposed Patch、Verify Last Fix、Resume Debug Session and Verify、Show Debug Session、Check Debug Environment 和 Show Debug Output。

Workspace trust 必须启用；historical execution 还有额外 modal warning。

## 与 Safe 族关系

```text
Review   → 修改有没有风险
Diagnose → CI/build/test 为什么失败（只读）
Debug    → failure 的因果调查、受控修复与 before/after 验证
Commit   → 安全提交
Change   → PR/MR 交付
```

当前 `0.1.0` 仍是 development baseline，不代表 Marketplace/Release ready。是否转 active 将由 Family contract、真实质量语料和发行门禁共同决定。
