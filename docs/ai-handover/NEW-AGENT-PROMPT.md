# 通用新智能体启动提示词

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：通用新智能体启动提示词。

请接续Personal Finance。首先阅读根AGENTS.md和docs/ai-handover/00-START-HERE.md，再读09-CURRENT-STATUS.md、10-BACKLOG-AND-ROADMAP.md及08-TESTING-AND-QUALITY.md。检查当前分支、HEAD、git status，保留既有修改和未跟踪源码，不自动提交、推送、还原或清理。

以当前源码、EF迁移、实际配置和本次可复现测试为准，不把历史报告当当前通过。先核对Node/pnpm/.NET与隔离开发数据库，注意pnpm可能触发重装。不要把根sql旧方案用于当前应用库。

保护真实账务、备份和密钥，代码交接与数据交接分开，不打印秘密，不在正式库运行测试、初始化或破坏性迁移。先按10的首项任务建立可复现候选与隔离回归，再接续已授权需求，复用已有模块，不重新开发。

修改功能时遵守11的金额、事务、幂等、用户隔离与AI授权规则，执行对应测试并区分通过/失败/跳过/未执行。结束更新09、10、15，按需同步API、数据库、架构与测试；未完成工作按SESSION-HANDOFF-TEMPLATE交接。高影响且授权不明时说明实际阻碍，不擅自操作生产。

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。
