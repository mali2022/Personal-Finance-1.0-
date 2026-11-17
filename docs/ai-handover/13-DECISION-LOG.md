# 技术决策

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：技术决策。

|决策|证据|约束或原因|
|---|---|---|
|独立EF应用库|backend/README、FinanceDb|隔离旧库不兼容结构|
|事务+用户锁+幂等|FinanceService.Write|防重复和跨表不一致|
|JWT核验Session|Program|支持撤销，不仅验签|
|API no-store，PWA缓存壳|Program、vite.config|离线壳不等于离线财务同步|
|DeepSeek官方域、保护密钥|AiOptions、Program|跨机DPAPI需额外方案|
|费用限额移除，资源保护保留|UsageService、Gateway|旧兼容字段不是执行配额|
|AI读与写确认分离|Privacy、FinanceService|全读不授予自动写|
|日期公告与产品版本分离|AGENTS、releases|不同代码不能复用旧公告|
|隔离回归用独立 LocalDB 实例|2026-10-31 实测|与正式 `Server=.` 物理隔离；随机 RestoreCheck 库 + 库名/InitialCatalog 双重校验|
|真实库迁移只读核对、不自动应用|2026-10-31 实测|真实库 46/93 迁移；应用需备份+隔离演练+维护窗口授权|
|不靠改测试换取全绿|2026-10-31 实测|后端日历断言、前端文案漂移各 1 项，属口径决策，需数据所有者定|
|前端不用裸 pnpm|2026-10-31 实测|本机 pnpm 12.11.2 与声明 11.19.0 不一致会触发重装，改 node 直接入口|

原因部分由源码约束推断，不声称原始讨论完整。未决：SSD/跨机便携、两个失败测试的口径取舍、真实库 47 个待应用迁移的窗口、性能基线可比性与百万查询 SLA。

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。
