# 环境与运行

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：环境与运行。

## A 本次验证（2026-10-31 第二轮，隔离库实测）

Windows 11 26200；node v24.20.0、.NET SDK10.0.401（runtime 10.0.12）、dotnet-ef 10.0.13、本机 pnpm 12.11.2。项目声明 Node>=24、packageManager pnpm@11.19.0、net10.0。SQL Server 2025 Express 17.0.1050.2（真实库所在默认实例 `Server=.`）；本轮新建独立 LocalDB 实例 `PFRestoreCheck`（17.0.4025.3）做回归。

实测：后端两个项目 `--no-restore` 构建 0 error/0 warning；93/93 迁移应用到随机 `PersonalFinanceWeb_RestoreCheck_<32hex>` 库，`has-pending-model-changes` 无变更；后端全量 836 总数/821 通过/1 失败/14 跳过（3.75 分钟）。前端 `validate-releases.mjs` 通过（79 公告）、`tsc -b` 通过、全量 Vitest 606 用例/605 通过/1 失败/0 跳过（808 秒）、生产构建通过。全程未调用 pnpm，真实库只做一次只读迁移历史查询。命令全文、失败诊断与未执行项见 [16-CANDIDATE-VERIFICATION-20261031.md](16-CANDIDATE-VERIFICATION-20261031.md)。

上一轮（同日早些时候）记录：`Releases.test.tsx` 10 项、`PlanningMathTests` 11 项通过；仅作历史。

## B 配置与运行（本轮未启动应用）

先准备独立开发SQL Server，设置ConnectionStrings__Finance、Auth__SigningKey（至少32字符）、ASPNETCORE_ENVIRONMENT=Development、ASPNETCORE_URLS=http://127.0.0.1:5085。数据库**必须**是隔离库（独立实例 + 随机 RestoreCheck 名），连接串含真实账本库即为违规。

```powershell
# 前端终端（已装依赖时直接 dev；pnpm 版本不一致，先按 C 节处理再执行 install）
cd frontend
pnpm install --frozen-lockfile   # 仅在确认 pnpm 为 11.19.0 后使用
pnpm dev
# 后端终端，从仓库根；连接必须是隔离开发库
 dotnet run --project backend/src/PersonalFinance.Api --no-launch-profile
```

前端5173代理5085（2026-11-18 及以前为 5080），integration5174，preview4173。是否MSW要结合main.tsx和环境模式，页面显示不证明真实API可用。

空白开发库显式--initialize-db会迁移、种子及可能写凭据文件；现有库先核对迁移历史，不能直接初始化。本次未启动应用，避免后台任务写真实库。

构建frontend中pnpm build（公告+tsc+vite）、pnpm verify:build；根目录dotnet build backend/src/PersonalFinance.Api。生产构建/启动/全量测试本次未执行。

停止手工服务用对应终端Ctrl+C；受控启动器scripts/PersonalFinance.Local.ps1 -Mode Stop需核对自身进程状态。**2026-11-14 起 Start 无 ConfigPath/StateDirectory 也只启动本地**（ConfigPath 默认 scripts/local-runtime.json、StateDirectory 默认 .local-run），隐式转云分支已删除，scripts/PersonalFinance.Cloud.ps1 已删除。本次实测：-Mode Start -NoBrowser 输出「已就绪：http://127.0.0.1:5174/」，`/api/health` 200 READY；迁移前需先 `dotnet build backend/src/PersonalFinance.Api/PersonalFinance.Api.csproj -c Debug`，否则 obj/Debug/net10.0/compressed 缺失会让后端启动即崩。

MSYS bash 下执行 `--initialize-db` 必须显式传参，仅 export ASPNETCORE_ENVIRONMENT 不够：`dotnet "backend/src/PersonalFinance.Api/bin/Debug/net10.0/PersonalFinance.Api.dll" --initialize-db --contentRoot "backend/src/PersonalFinance.Api" --environment Development --ConnectionStrings:Finance='Server=.;Database=PersonalFinanceWeb;Integrated Security=true;Encrypt=false;TrustServerCertificate=true'`。

## C 本次命令错误与规避

pnpm exec vitest触发依赖重装，ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY。原因是本机 pnpm 12.11.2 与 `packageManager: pnpm@11.19.0` 不一致，pnpm 的 `manage-package-manager-versions`（默认开）会在项目目录切换/安装版本。**本轮起全部改用 node 直接入口**，未安装、未改动 `node_modules`（前后 `.pnpm` 549 目录、lockfile 哈希不变）：

```powershell
cd frontend
node scripts/validate-releases.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run --configLoader runner
node node_modules/vite/bin/vite.js build --configLoader runner
```

若确实需要 pnpm：先 `corepack enable` 或显式安装 pnpm 11.19.0 并核对版本，再考虑 `pnpm install --frozen-lockfile`；不在原目录强行 purge/重装。数据库侧同样不要用 `--initialize-db` 代替 `dotnet ef database update` 做检查，前者会写种子。

## SSD及Windows

脚本使用PSScriptRoot，但SQL服务、运行时、密钥和配置未随仓库便携。中文路径读取和定向测试成功；全新电脑、盘符变化、移动SSD启动未验证。DPAPI通常绑定机器/账户，运行中的MDF/LDF不得直接搬动。代码与数据分开交接，云端主账本和本地账本无自动双向同步证明。

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。
