# Codex Debug Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Codex Debug Safe 是 Codex Safe 产品族中的**证据驱动 Debug 与修复验证产品**。它从一个真实 failure 出发，构建有界证据、维护显式 Hypothesis Ledger、可生成最小文本 patch proposal，并且只有在显式验证命令真实成功后才允许进入 `verified`。

它不是 `codex-diagnose` 的重复实现：Diagnose 保持“CI/build/test 的有界只读单次诊断”；Debug 负责工作区内更完整的“调查 → 修复 → 验证”闭环。

## 首版直接铺开的范围

- build/link failure
- unit/integration test failure
- native crash / stack trace
- ASAN / TSAN / UBSAN / LSAN / Valgrind
- Linux dmesg / kernel panic / watchdog / lockup
- Android logcat / ANR / tombstone
- MCU HardFault / BusFault / UsageFault
- dependency / infra failure
- performance / latency regression
- 本地日志、编辑器选区、stdin、显式 reproduction command
- Git HEAD/status/recent history 关联
- 支持证据/反证据的根因 hypothesis ledger
- 有界 unified diff patch proposal
- 用户显式授权后才允许 apply
- 用户显式 verification command 后验证修复
- Debug Receipt v1
- CLI + VS Code 共用同一引擎

## 核心安全边界

```text
真实 failure
   ↓
redact / bound / parse / fingerprint
   ↓
只读 Git context
   ↓
模型调查（没有工具执行权）
   ↓
hypothesis ledger + patch proposal
   ↓
只有用户显式授权：
--command / --verify-command / --apply
   ↓
确定性验证
   ↓
Debug Receipt
```

日志、stack、文件名、commit subject、测试输出、仓库文本全部视为**不可信数据而非指令**。模型不能通过返回文本获得执行命令、修改文件、commit、push、merge 或联网权限。

模型也不能自行把 hypothesis 标记成 `confirmed`；只有真实验证证据才能提升到 confirmed。

## 使用

```bash
codex-debug --log build.log
codex-debug --command "npm test"
adb logcat -d | codex-debug --kind android
codex-debug --log sanitizer.log --deterministic-only
```

显式 apply + verification：

```bash
codex-debug \
  --command "npm test" \
  --apply \
  --markdown debug-report.md \
  --output debug-session.json
```

如果指定了 `--apply`，模型 patch 仍必须先通过路径、二进制、大小、submodule 边界以及 `git apply --check` 门禁。Codex Debug Safe 不会自动 commit/push/merge。

## VS Code 命令

- Debug Selected Failure Evidence
- Debug Failure Log File
- Debug Reproduction Command
- Apply Last Proposed Patch
- Verify Last Fix
- Check Debug Environment
- Show Debug Output

不可信工作区直接禁用。

## 与 Safe 族关系

```text
Review   → 修改有没有风险
Diagnose → CI/build/test 为什么失败（只读）
Debug    → 已发生 failure 的因果调查、修复与验证
Commit   → 安全提交
Change   → PR/MR 交付
```

当前 `0.1.0` 是首个开发基线，不代表已经达到 Marketplace 发布状态。首版会先把架构、能力、测试和 Family 门禁铺开，再谈上线。
