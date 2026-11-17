<!-- version-catalog: 5.2.2; sequence: 116 -->
> 归档版本：Personal Finance 测试版 5.2.2；顺序：116；时间依据：未记载日期（归入当前维护文档）。原文中的旧版本、阶段号及验收状态保留用于追溯。

# Personal Finance · 真实后端

> 说明：本文引用的《Personal Finance 测试版 …》系列过程文档已在 1.0 正式版整理时合并删除，内容现见 docs/版本历史-1.0.md 与 docs/维护手册-1.0.md。

已实现 React → ASP.NET Core 10 → Application 服务 → EF Core 10 → SQL Server，并完成本机 SQL Server 17.0.1050.2 的 API 和浏览器联调。前端只通过 HTTP 访问后端。

Personal Finance 3.0 阶段 B 已增量接入周期交易、待确认实例、订阅、自动分类预览与日志、财务日历及首页提醒。计划默认不影响余额，确认后复用既有资金业务。交付、真实 SQL 验证、迁移与备份记录见 阶段 B 交付记录；阶段 A 未通过的性能项仍见 技术债务。

阶段 C2 已交付交易批量元数据编辑、原子预览/执行/结果和独立待整理问题处理。实现、迁移、资金保护、验证及限制见 阶段 C2 交付报告。C3–C5 按用户要求暂缓。

## 数据库与历史账本

当前使用默认实例 `.` 的 **PersonalFinanceWeb**，表位于 finance schema，由受控 EF Core migrations 管理。原 PersonalFinance、PersonalFinanceDB、PersonalBookkeeping 未修改，根目录 SQL 脚本保留；**没有自动迁入原数据库历史数据，也没有调用原存储过程**。独立库避免对现有26张表直接执行不兼容的 Guid、认证与版本迁移。后续迁入历史数据应先备份，建立 ID 对照，再逐笔核对分录与余额。

正式用户初始账本为空，包含五个零余额账户及两层分类。**默认分类树不再硬编码在代码里**，而是由 `src/PersonalFinance.Api/Infrastructure/DefaultCategories.json` 提供（编译为嵌入资源），内容为用户实际账本的分类树：51 个一级、610 个二级。要更换默认分类只需替换该 JSON 重新构建，`Bootstrap.SeedDefaults` 会校验名称非空、Kind 只能是 Expense/Income，子分类继承父级方向。测试记录在独立 integration@personal.finance 用户中；最初正式用户里的自动测试样本已精确清理。

## 启动与登录

日常使用双击项目根目录 `打开PersonalFinance.bat`（或 `启动PersonalFinance.bat`），启动本地实例 http://127.0.0.1:5174/，API 在 http://127.0.0.1:5085（2026-11-18 及以前为 5080），数据库为本机 SQL Server 默认实例 `.` 的 `PersonalFinanceWeb`。2026-11-14 起不再连接云服务器：`scripts/PersonalFinance.Local.ps1 -Mode Start` 只启动本地，`停止PersonalFinance.bat` 停止本地进程。云端恢复通道仅保留 `deploy/scripts/pull-cloud-to-local.ps1`（只还原到 Cloud 验证库，不覆盖本地账本）与 `deploy/阿里云连接信息.txt`；历史说明见 云端主账本使用说明（已停用）。

要求 .NET SDK 10、Node 24、SQL Server。在项目根目录运行：

```powershell
./backend/scripts/start-api.ps1
```

另一个终端：

```powershell
cd frontend
pnpm dev:api
```

真实应用：http://127.0.0.1:5174；API：http://127.0.0.1:5085/api。5173 仍是原 Mock 模式。

登录邮箱 **owner@personal.finance**，随机密码请打开 `src/PersonalFinance.Api/bootstrap-credentials.local.json` 查看。密码仅以哈希进入数据库，该本地文件、签名密钥和 Data Protection keys 均排除 Git、Docker 与源码文档。当前没有开放注册或修改密码 UI。

新机器初始化使用 `./backend/scripts/start-api.ps1 -Initialize`。本机 SQL 默认数据目录曾指向不存在的 D 盘路径，已只为新库使用 master 文件所在目录创建文件，没有修改服务器默认目录；同类环境可检查后执行 `scripts/create-local-database.sql`。**不要执行原 Build.sql 来安装应用数据库**。

创建隔离测试用户：`./backend/scripts/start-api.ps1 -CreateIntegrationUser`。初始化不覆盖已有用户密码。其他用户可通过环境变量 Bootstrap__Email、Bootstrap__Password 后运行 --initialize-db，密码至少12字符。不要将密码写入命令行参数或提交 Git。

## 架构与规则

```text
src/PersonalFinance.Api/
  Program.cs                    认证、异常、CSRF、代理、依赖注入
  Contracts/Requests.cs         请求 DTO，与数据库实体分离
  Domain/Entities.cs            账户、分类、交易、分录、用户、业务
  Application/
    FinanceEndpoints.cs         核心 HTTP 路由
    OperationsEndpoints.cs      文件、导入、导出与对账路由
    AuthService.cs              密码、JWT、刷新会话
    FinanceService.cs           记账、退款、查询、版本与幂等
    ReportsService.cs           预算、收支、净资产、账单
    BusinessService.cs          目录、借贷、报销
    OperationsService.cs        文件、导入、导出、对账
  Infrastructure/
    FinanceDb.cs                EF 映射、索引与约束
    Bootstrap.cs                首次用户、账户与分类
    Migrations/                 迁移和模型快照
tests/PersonalFinance.Tests/     xUnit 规则测试
tests/integration.mjs            真实 HTTP / SQL 检查
```

写入按用户获取 SQL Server transaction-owned applock，在同一事务内完成校验、分录、版本和幂等响应保存。余额由期初余额加有效账户分录汇总，前端不能通过账户 metadata 任意改余额。转账、信用卡还款、借贷及报销本金不计收支，退款冲减费用。费用、损失和调整由统计规则控制。

跨币种转账保存来源币种的平衡预览，汇率最多八位小数；净资产和报表按币种隔离，不把没有估值汇率的外币并入人民币。金额以十进制字符串输入输出，C# decimal / SQL decimal(28,4)，当前币种输入最多两位小数。

所有资源查询包含当前认证 userId，不接受客户端指定 userId。访问他人资源返回404。金融写入要求 Idempotency-Key；编辑要求 If-Match。幂等同请求返回原响应，不同内容复用键返回409。软删除保留交易及分录。带有效退款的原消费编辑/删除被保护，须先处理关联退款。退款同时校验总额度及分类额度；已删除原借款不可继续结算。对账预览后提交，复核账户版本与系统余额。

账户、分类、商户、项目、标签、模板、预算、拆分、退款、信用卡、借出/借入、报销、资产损失、对账及文件接口对应前端 src/api。成功返回 {data,traceId}，错误返回中文 {message,code,traceId}，不会暴露 SQL 或堆栈。列表服务端分页，pageSize 最大100。

## 认证与生产配置

JWT 前端内存保存，10分钟过期。刷新 Cookie 14天、HttpOnly、SameSite=Strict，数据库只存 SHA-256；轮换刷新凭据，注销撤销会话，每次 JWT 验证确认数据库会话有效。GET /api/auth/me 或 /api/auth/csrf 发放 CSRF Cookie，刷新/注销验证 X-XSRF-TOKEN；登录验证 Origin 并限流。同源代理由 Axios 自动发送 CSRF header。

开发随机签名密钥保存在忽略的 appsettings.Local.json；生产不读取本地配置，必须由部署环境提供：

```text
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__Finance=<加密的SQL Server连接字符串>
Auth__SigningKey=<至少32字符的随机密钥>
AllowedHosts=<实际域名>
AllowedOrigins__0=https://<实际域名>
DataProtection__KeyPath=<受保护且持久的密钥目录>
TrustedProxyNetworks__0=<实际可信代理CIDR>
```

本机开发使用 Windows 集成认证，Encrypt=false 仅用于本机；生产使用有效证书和加密连接。Cookie 在生产强制 Secure，需 HTTPS 同源部署。只信任配置的代理网段。Data Protection keys 本机持久化到 .keys，Windows 使用 DPAPI 保护；Linux 部署应为持久密钥卷设置严格权限及存储加密。

`docker build -t personal-finance-api backend` 可构建后端，运行需要上述环境变量、SQL Server和持久密钥卷。端口8080，对接前端 Nginx 的 finance-api:8080。先以迁移账号执行 --initialize-db 或 EF migration SQL，再以最小权限运行账号启动服务。生产初始化必须设置 Bootstrap__Password。Docker和远程 CI 为已提供配置，尚未执行容器部署。

## 文件与规模限制

- 导入：UTF-8 CSV、XLSX第一张表及支付宝/微信/银行卡映射；最多10MB、5000行、100列，解压规模50MB。旧XLS、加密Excel和其他编码请先转换。预览可修改类型、分类、金额和转入账户，确认时重新校验和去重，整批事务提交。已导入指纹有数据库唯一约束。
- 附件：JPG/PNG/PDF，10MB，文件头与扩展名校验，SQL binary存储，授权下载，no-store/nosniff。未接入病毒扫描；公网开放上传前应接入扫描与隔离存储。
- 导出：后端执行相同筛选生成CSV/Excel，转义公式字符，单次最多10万条，超限明确报错。不是数据库备份；百万行异步任务、对象存储尚未实现。
- 报表使用SQL聚合及有限时间点，未做百万行负载测试。数据库备份由SQL Server管理员执行；新增本机手动完整备份与隔离恢复工具，见下文。

## 完整备份与隔离恢复（3.0 A1）

Windows 默认 SQL 实例、PowerShell 7，从工作区根目录运行：

```powershell
pwsh -NoProfile -File backend/scripts/backup-finance.ps1
pwsh -NoProfile -File backend/scripts/backup-history.ps1
pwsh -NoProfile -File backend/scripts/verify-finance-restore.ps1 -BackupId '<实际备份编号>'
```

备份固定为 PersonalFinanceWeb，包含 SQL 存储的附件。受保护目录 backend/.backups 已从源码/镜像排除。恢复只创建随机命名的独立验证库，核对内容、余额、附件并运行 CHECKDB；不会覆盖正式库。验证副本撤销会话后设只读。

本机实际演练已通过，尚无定时备份、加密异机副本或网页恢复入口；阶段 A 其他缺口仍需修复。适用范围、权限、RPO/RTO、密钥重建与灾难恢复步骤见 恢复手册，证据与测试见 A1交付记录。

## 验证

```powershell
dotnet restore backend/tests/PersonalFinance.Tests --configfile backend/NuGet.Config
dotnet test backend/tests/PersonalFinance.Tests --no-restore
node backend/tests/integration.mjs
cd frontend
pnpm e2e:api
```

当前受限环境需要按启动脚本设置 DOTNET_CLI_HOME、APPDATA、NUGET_PACKAGES。本机浏览器缓存为 frontend/.playwright-browsers，运行Playwright前设置 PLAYWRIGHT_BROWSERS_PATH 为该绝对路径。

已通过18项 xUnit、27项真实 HTTP/SQL、4项真实浏览器测试；原前端56项单元测试继续通过。再次测试会追加带唯一后缀的隔离样本，不清空正式账本。详见 验证记录。

技术依据：[SQL Server provider](https://learn.microsoft.com/en-us/ef/core/providers/sql-server/)、[EF Core concurrency](https://learn.microsoft.com/en-us/ef/core/saving/concurrency/)。


阶段 D 年度预算、结转、储蓄目标、财务指标与现金流交付：完整报告。

## 近期业务扩展文档

- 近期功能统一索引
- 后台管理、帮助与反馈：操作、权限和 API
- 薪酬与社保中心：业务、数据边界、政策、导入与验证
- 首页 AI 财务洞察：复用 DeepSeek 接口及授权边界
- 首页日历：复用交易与日报表接口

首页日历、洞察及手机商户下拉没有引入独立的交易、账户或 AI 数据库表。
