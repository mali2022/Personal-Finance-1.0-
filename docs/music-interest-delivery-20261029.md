# 艺人与品牌长期消费扩展交付记录

版本：Personal Finance 测试版 6.19.0，发布号 2026.10.29.9。

## 数据结构与记账口径

复用现有 StoredDocument、FinanceTransaction、AuditRecord 及 FinanceService.Write 的用户级数据库事务锁、版本检查、幂等记录。新增文档类型 MusicTopic（艺人/品牌）、MusicBrandLink（多对多关系及有效期）、MusicPurchase（订单、商品、明确艺人金额分配和退款分配）、MusicBudget、MusicAttachment、MusicAdvice。关联 ID 引用原交易与场次；不新增资金分录、净资产或分类预算扣减。

无需数据库结构迁移：未增加表、列或改写旧 ConcertScene 内容，因此没有新的 Up/Down 迁移。回滚使用原发布流程恢复代码及有效备份，新增附属文档保留，原账本仍可独立运行；不要清空正式数据库来回滚。旧场次继续使用原接口和路由。原档案明确填写的艺人名称用于历史场次专题比较，不按日期或商户推断归属。

订单可含多个商品；单价乘数量减优惠加运费和税费须等于商品实付。整单与跨档案分配不超过原付款，商品稳定 ID 不能跨档案复用。多个艺人必须明确分配金额，未分配部分不会重复归给每个艺人。普通商品可取消“计入兴趣专题”，其金额仍用于核对订单，不进入专题统计。退款引用原付款下真实已确认退款，并限制跨商品、跨场次分配上限；多艺人比例退款采用最大余数法精确到分。原交易失效时提示核对，不以商品持有或退货状态代替真实资金事件。

本模块沿用演唱会原币分别汇总口径，不进行混币合计或自动获取汇率。老场次缺少的原价、优惠不能追溯推算，历史行以已登记费用作为金额基线。原代垫应收、结算和本人损失仍以原演唱会报告为权威；兴趣分析中的旧场次行只汇入本人消费交易，不把他人代垫本金算作消费。

## 页面与交互

保留 /concerts 和默认演唱会档案流程。新增日常周边、艺人/品牌、商品与收藏、消费分析标签。购买计划不要求场次、付款、城市或演出名称；真实购买从原账本选择付款。新资金消费和退款仍由原记账入口创建，然后分配商品，不建立第二套账本。现有导入交易也可在导入确认后选择或通过历史匹配关联。

支持多商品、款式尺码颜色版本、数量、单价、优惠运费税费、用途、商品状态、品牌、多个艺人的明确分配金额、退款、标签、备注、图片和PDF凭证。档案支持卡片与表格，计划和已购状态明确区分。收藏不写入净资产。

品牌可独立存在，关系可多对多并编辑有效期。历史候选通过文字匹配展示待核对建议，不自动写入；整单批量关联需确认，混合订单应逐项分配。关系变更不自动重分类交易。

分析支持年度、累计、月度和年度趋势、消费类型、品牌、商品类别，按艺人、品牌、商户、年度及场次筛选，同页提供真实交易下钻。专题预算按月或年、艺人或品牌、日常/场次/全部划分，达到80%提示，仅分析，不重复扣减分类预算。

计划可提交既有消费审批中心。AI建议调用既有隐私授权与供应商，发送前需确认，结果留存附属文档与审计；不自动扣款或自动采用专题。历史规则匹配明确标注为规则建议，不冒充模型推理。

## API

前缀 /api/concerts/interests：

- GET /catalog：艺人、品牌、关系及预算。
- POST /topics、PUT /topics/{id}：维护艺人或品牌。
- POST /links、PUT /links/{id}：维护多对多关系及有效期。
- POST /budgets、PUT /budgets/{id}：维护专题预算。
- GET /purchases?page=&size=：服务端分页，单页最多100。
- POST /purchases、PUT /purchases/{id}：保存计划或购买档案；编辑可解除关联，原交易保留。
- GET /report?currency=&year=&artist=&brand=&merchant=&scene=：year=0 为累计，原币分别统计。
- GET /candidates?currency=&page=&keyword=：分页历史候选和待确认文字匹配。
- POST /batch-link：明确确认的整单历史关联，最多50笔，复用 Write 事务和幂等机制。
- GET、POST /purchases/{id}/attachments；GET /purchases/{id}/attachments/{attachmentId}：用户隔离图片/PDF凭证。
- GET /purchases/{id}/history：关联修改审计。
- POST /purchases/{id}/approval：计划提交原审批中心，不产生扣款。
- POST /purchases/{id}/advice：经授权和资料版本检查的 AI 建议。

结构写入使用 If-Match 和 Idempotency-Key；附件用版本检查。前端安全提交恢复白名单已扩展，不允许任意地址。

## 验证与边界

实际执行：

- `powershell -ExecutionPolicy Bypass -File tools/verify-concert-sql.ps1`：8项通过，无跳过。创建并最终删除隔离 SQL Server 数据库；包括原场次生命周期回归及新购买、混单、退款、解除艺人、幂等、场次费用、附件、累计和分币种、预算、冲突、分页验证。
- `dotnet test backend/tests/PersonalFinance.Tests --no-restore --filter FullyQualifiedName~InterestAccountingTests --verbosity minimal`：7项通过，包含三艺人退款分币守恒。
- 前端 Vitest：ConcertInterests、Concerts、operationJournal 共157项通过。此为组件与本地提交恢复测试，不当作真实数据库测试。
- Playwright 原场次360/1440两项及新增日常购买360/1440两项通过。浏览器流程使用拦截接口；数据库真实性由前述隔离 SQL 测试证明。
- TypeScript 检查通过；生产构建、版本及产物完整性检查由 push-update.ps1 执行，最终部署结果以命令输出及线上 health/release-info 为准。
- 2,003条隔离购买/计划记录，第50页20条与总数正确；分页小于5秒，专题报表小于10秒。批量部分为计划记录，不声称为百万已购交易性能或完整大规模统计压力测试。

未执行真实外部 AI 供应商付费调用；AI可用性依赖现有用户授权、供应商配置与额度。没有新结构迁移，因此未执行虚构的迁移回滚测试。不同币种暂不合并。图片凭证归订单附属档案，多商品订单可用文件名区分商品；没有独立金融估值。原演唱会代垫与本人损失的完整口径继续查看原年度和场次报告。

## 修改文件

后端 Application：InterestAccounting.cs、InterestReports.cs、InterestScenes.cs、InterestEndpoints.cs、InterestAttachments.cs、InterestSuggestions.cs、InterestAi.cs；以及 ConcertService.cs、ConcertReports.cs、ConcertEndpoints.cs。

后端测试：InterestAccountingTests.cs、ConcertInterestHttpTests.cs、ConcertTests.cs（允许测试分部扩展）。

前端：features/concerts/interestApi.ts、InterestPanel.tsx、InterestFiles.tsx、InterestHistoryMatch.tsx、InterestAdvice.tsx；pages/ConcertsPage.tsx；stores/operationJournal.ts；tests/ConcertInterests.test.tsx；redesign-tests/concerts.spec.ts；data/releases.json；package.json。

交付记录：本文件。没有清理或覆盖用户原有修改、测试日志或已有备份。
