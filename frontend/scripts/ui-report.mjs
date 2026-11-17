import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'verification/ui');
const exports = {};
const source = fs.readFileSync(path.join(root, 'src/design/navigation.ts'), 'utf8');
new Function('exports', ts.transpile(source, { module: ts.ModuleKind.CommonJS }))(exports);
const groups = exports.navigationGroups;
const readJson = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
const tables = readJson('table-layout-changes.json');
const privacy = readJson('privacy-field-changes.json');
const inventory = [];
function inspect(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) inspect(target);
    else if (entry.name.endsWith('.tsx')) {
      const source = fs.readFileSync(target, 'utf8');
      const ast = ts.createSourceFile(entry.name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const components = {};
      function walk(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const name = node.tagName.getText(ast);
          components[name] = (components[name] || 0) + 1;
        }
        ts.forEachChild(node, walk);
      }
      walk(ast);
      inventory.push({ file: path.relative(root, target).replaceAll('\\', '/'), components });
    }
  }
}
inspect(path.join(root, 'src'));
fs.writeFileSync(path.join(output, 'component-inventory.json'), JSON.stringify(inventory, null, 2));
const count = name => inventory.reduce((sum, file) => sum + (file.components[name] || 0), 0);
const modules = {
  '/': 'DashboardPage', '/transactions': 'TransactionsPage', '/transactions/review': 'TransactionsPage',
  '/accounts': 'AccountsPage', '/categories': 'CategoriesPage', '/benefits': 'BenefitsPage',
  '/investments': 'InvestmentsPage', '/investments/performance': 'InvestmentPerformancePage',
  '/term-deposits': 'ManagedAssetsPage', '/physical-assets': 'ManagedAssetsPage', '/assets/allocation': 'AssetAllocationPage',
  '/reports': 'ReportsPage', '/reports/custom': 'CustomReportsPage', '/budgets': 'BudgetsPage', '/budgets/annual': 'AnnualBudgetsPage',
  '/goals': 'GoalsPage', '/planning/indicators': 'FinancialIndicatorsPage', '/cashflow': 'CashFlowPage',
  '/settings': 'SettingsPage', '/settings/currencies': 'StageGAnalysisPage',
  '/accounts/fund-status': 'StageGPage', '/prepayments': 'StageGPage', '/payroll': 'StageGPage', '/advances': 'StageGPage',
  '/settings/payment-instruments': 'StageGPage', '/analytics/living-cost': 'StageGPage',
  '/analytics/living-cost/index': 'StageGAnalysisPage', '/memories/on-this-day': 'StageGAnalysisPage',
  '/loans': 'BusinessPage', '/reimbursements': 'BusinessPage',
  '/projects': 'DirectoryPage', '/merchants': 'DirectoryPage', '/tags': 'DirectoryPage', '/templates': 'DirectoryPage',
  '/import': 'ImportPage', '/reconciliation': 'ReconciliationPage', '/recurring': 'RecurringPage',
  '/subscriptions': 'SubscriptionsPage', '/calendar': 'CalendarPage', '/automation': 'AutomationPage',
};
const audits = Object.fromEntries(['light', 'dark', 'mobile', 'private', 'wide'].map(mode => [mode, readJson(mode + '-audit.json')]));
const routeRows = groups.flatMap(group => group.routes.map(([route, label]) => {
  const module = modules[route];
  const table = tables.find(page => page.page === module + '.tsx')?.tables || 0;
  const fields = privacy.find(page => page.page === module + '.tsx')?.fields || [];
  const status = Object.values(audits).every(pages => pages.some(page => page.path === route && page.scroll <= page.width + 1 && page.headings.length > 0 && page.alerts.length === 0));
  const change = ['统一页面标题与主题', table ? `${table} 处表格补横向滚动` : '', fields.length ? `敏感展示：${[...new Set(fields)].join('、')}` : ''].filter(Boolean).join('；');
  return `| ${label} | ${route} | ${module}.tsx | ${change} | ${status ? '五模式通过' : '待核对'} |`;
}));
const assets = fs.readdirSync(path.join(root, 'dist/assets')).filter(name => /\.(js|css)$/.test(name)).map(name => {
  const bytes = fs.readFileSync(path.join(root, 'dist/assets', name));
  return { name, bytes: bytes.length, gzip: zlib.gzipSync(bytes).length };
});
fs.writeFileSync(path.join(output, 'build-sizes.json'), JSON.stringify(assets, null, 2));
const big = assets.sort((a, b) => b.bytes - a.bytes).slice(0, 3).map(asset => `| ${asset.name} | ${(asset.bytes / 1000).toFixed(2)} kB | ${(asset.gzip / 1000).toFixed(2)} kB |`).join('\n');
const screenshots = fs.readdirSync(path.join(output, 'screenshots')).filter(name => name.endsWith('.png'));
const pageGrid = groups.flatMap(group => group.routes.map(([route, label]) => {
  const name = route === '/' ? 'dashboard' : route.slice(1).replaceAll('/', '-');
  return `<section><h2>${label}</h2><p>${route}</p><div class="grid">${['light','dark','mobile','private','wide'].map(mode => `<a href="screenshots/${mode}-${name}.png"><span>${mode}</span><img loading="lazy" src="screenshots/${mode}-${name}.png" alt="${label} ${mode}" /></a>`).join('')}</div></section>`;
})).join('\n');
fs.writeFileSync(path.join(output, 'gallery.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal Finance UI 视觉验收</title><style>body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;margin:0;padding:32px;background:#f5f7f5;color:#263b34}main{max-width:1600px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}a{color:#287d70;text-decoration:none}img{width:100%;height:300px;object-fit:contain;object-position:top;background:white;border:1px solid #dde7e0;border-radius:12px}section{margin:32px 0}span{display:block;padding:8px}p{color:#60736a}</style><main><h1>Personal Finance 3.0 · UI 视觉验收</h1><p>40 个入口 × 5 种模式。点击查看完整截图；截图来自真实只读巡检，未替换业务数据。</p>${pageGrid}</main></html>`);
const report = `# Personal Finance 3.0 — 全站 UI/UX 升级交付报告

日期：2026-10-11（Asia/Shanghai）。交付对象：当前真实 React 前端。实现文件、生产 dist、测试与截图均保存在项目内。

## 1. 原始页面与组件审计

开发前读取 routes/index.tsx、AppLayout.tsx、styles.css、入口主题、UI Store、Money、Feedback、Chart、页面及业务组件、API 和测试配置。

发现并处理的主要问题：导航大量平铺且遗漏 G 阶段入口；路由高亮仅取第一段路径；手机只能通过有限入口找模块；主题散落在硬编码 CSS 和固定背景色判断中；首页遗漏 API 已提供的资产/负债指标；交易备注、账户名称与预算比例存在隐私展示缺口；部分专项表格缺少自身横向滚动；模态截图容易捕获动画中间帧。

当前盘点包含 ${inventory.length} 个 TSX 文件。静态 JSX 定义统计：Table ${count('Table')}、Form ${count('Form')}、Drawer ${count('Drawer')}、Modal ${count('Modal')}、Chart ${count('Chart')}、PageTitle ${count('PageTitle')}。这些是组件定义数量，动态数组、条件渲染及多个实例不等于该计数。完整清单见 [component-inventory.json](../verification/ui/component-inventory.json)。

保留原 routes/index.tsx 的所有路由，包括 /transactions/:id、/accounts/:id、登录及 404；对具体记录详情另做浏览器检查。

## 2. 设计系统与 Tokens

Premium Minimal Fintech Dashboard：青绿色品牌、温和背景、低对比边界、统一卡片、清晰金融数字。设计入口为 src/design/theme.ts、tokens.css 和 navigation.ts。

| 语义 | 浅色 | 深色 |
| --- | --- | --- |
| 品牌 | #287d70 | #6bbfa9 |
| 页面 / 卡片 | #f5f7f5 / #ffffff | #182421 / #22312d |
| 正文 / 次级 | #263b34 / #60736a | #e4eee9 / #b1c3b9 |
| 收入 / 支出 | #327950 / #a65b32 | #79c19b / #e0b36f |
| 危险 / 信息 | #b34e48 / #456f9a | #ec9890 / #8cb6df |

间距变量：4/8/12/16/20/24/32/40；输入圆角 8、卡片 14、辅助圆角 6。字体采用系统 Segoe UI、PingFang SC、Microsoft YaHei；不新增外部在线字体。金额继续使用 Money 和 tabular-nums。标准控制高度 38px；手机底栏点击区至少 44px。按钮、输入、表格及卡片状态通过 ConfigProvider 和 CSS 变量管理；删除原样式的大面积 !important。

## 3. 页面改动清单

下表描述实际 JSX 改造和共享组件落地，不表示每页业务逻辑重写。共享页面标题、加载占位、错误反馈和图表容器作用于所有对应页面；30 处专项表格增加自己的横向滚动。

| 页面 | 路由 | 源文件（src/pages） | 展示层改动 | 验收 |
| --- | --- | --- | --- | --- |
${routeRows.join('\n')}

首页：展示服务端原有 assets、liabilities、netWorth、income、expense、surplus 六项指标；收支趋势优先；净资产趋势使用原 trend.netWorth；规划区可折叠；保留账户、预算、近期交易、统计口径和历史回顾。

交易：筛选卡片标题、可移除的应用条件提示、跨页选择含义提示；手机卡片补充商户、账户、分类和备注；详情补充信息分区；快速记账保留所有必要字段，增加金额/账户与备注分区。金额解析、分页、筛选参数、跨页选择、退款及确认机制未改。

规划、资产和专项：统一标题与主题；为缺失滚动的预算、现金流、目标、投资、资产、优惠和 G 阶段表格增加自身滚动；对已识别的名称、对象、备注、来源等敏感展示引入 Sensitive。G 阶段编辑器增加基本信息与资金归属标题，保留资金影响预览和确认按钮。

## 4. 全站导航结构

${groups.map(group => `- ${group.label}：${group.routes.map(([, label]) => label).join('、')}。`).join('\n')}

共 40 个导航入口，使用二级分组。最长路径优先匹配高亮，详情回退父入口。顶部增加面包屑与主题切换；保留搜索、快捷记账、特殊交易及用户菜单。桌面菜单单独滚动，底部保留空间信息及有名称的键盘折叠按钮。手机顶部和底部均可打开全部功能抽屉。

## 5. 视觉统一策略

PageTitle 统一真实页面标题；复杂表格保持足够内容宽度，图表与卡片使用 minmax(0, ...) 约束；重点数字可换行避免超大金额溢出；卡片、表单、Drawer、Modal 与 Ant Design 主题联动。金融意义仍由文字、交易类型和正负号表达。

## 6. 响应式改造

沿用 760、1150、1600px CSS 断点及 Ant Design lg。手机导航完整；交易列表保留跨页选择，专项表格单独滚动；Drawer 最大宽度 100vw，Modal 保持视口边距；金额输入保留 decimal 键盘；复杂编辑器保留所有资金确认字段。

检查视口：390×844、768×1024、1440×960、1920×1080。720×480 检查等效于 1440 宽布局在 200% 下的重排，不是操作浏览器真实缩放菜单。

## 7. 深色模式

使用 Ant darkAlgorithm 与独立语义颜色；根 HTML 同步 data-theme，portal 中的 CSS 变量也可用。卡片、菜单、表格、输入、Drawer、Modal、Tooltip 与图表文字/边界统一。去掉 Chart 的固定容器颜色判断，轴线和图例使用实时主题 Token。

## 8. 隐私模式

继续使用原 Zustand hidden 与 Money；Sensitive 在 DOM 中用遮挡文本替代敏感内容。补齐交易表格/详情、账户卡片、业务对象/备注、项目名称、订阅/周期名称、资产来源和其他已识别的展示字段。G 阶段原有隐藏规则继续继承。预算比例和执行条不再泄漏金额关系；隐藏图表时销毁 ECharts，并移除图表数据表。

隐私模式是展示保护，未改变服务端数据或资金操作权限；用户主动输入的金融表单内容仍需要本人核对。完整专项、多状态、多附件的隐私验证仍需充足隔离样本，见第 15 节。

## 9. 动效清单

按钮/账户行反馈 160ms；Ant 中等/慢速动效 180/240ms；不新增转场框架，不使用金额插值。CSS 和 Ant motion Token 同时遵循 prefers-reduced-motion，避免只缩短 CSS 而留下组件的退出状态。Header Tooltip 隐藏后销毁。截图关闭有限 CSS 动画以捕获完成状态。

## 10. 无障碍改进

主要内容 main landmark、跳转链接、明确页面 h1、可见焦点、主题/隐私/用户菜单/手机导航名称、真实按钮形式的导航折叠、当前手机入口 aria-current、表单分区、错误 alert、加载 status、图表原始数值表入口。保留 Ant 的焦点陷阱、ESC 与关闭后的焦点恢复；浏览器测试覆盖快速记账焦点、表单 ESC、侧栏键盘及减少动效。

以 WCAG 2.2 AA 为设计目标；本次不是独立的全量 WCAG 合规认证，未完成读屏软件逐控件测评。

## 11. 加载、错误和空状态

页面 LoadingState 保留稳定高度并提供读屏状态；原 Skeleton/分页加载继续保留。可读取查询增加明确重试。隐私模式下错误详情不输出敏感内容。无趋势或无可绘制正支出提供真实空状态；负支出/退款仍留在明细。保留 operationJournal 与未知写入恢复逻辑；未把金融请求超时转换成可任意重复提交。

## 12. 性能变化

保留路由和图表 lazy/Suspense，未安装新运行时 UI 框架或动效库。ECharts 使用原按需注册方式，并增加内置 Aria 支持；观察器与实例在卸载/隐私切换时清理。没有改造前性能基准，不能据此宣称性能提高百分比。

当前生产主要资源：

| 资源 | 原始体积 | gzip |
| --- | --- | --- |
${big}

Vite 仍提示部分 chunk 超过 500kB；这是后续按路由/依赖拆分的检查项，本阶段未进行大规模架构重构。详见 build-sizes.json。

## 13. 测试结果

| 检查 | 结果 / 边界 |
| --- | --- |
| pnpm typecheck | 通过 |
| pnpm lint | 通过 |
| pnpm build | 通过；保留 chunk 大小提示 |
| Vitest --maxWorkers=2 | 15 个测试文件，163 项通过 |
| 原 Chromium E2E --workers=2 | 26 项通过；金融写入由 MSW 内存模拟，未写入真实数据库 |
| UI Chromium 只读验收 | 全套 9 项通过；侧栏截图修正后剩余 1 项单独复验通过，共 10 项。覆盖 40 路由×5 模式、21 类表单×2 视口、详情/二级视图/键盘/图表数据 |

真实页面巡检使用现有 5174 前端及 API，测试拦截所有非认证写入；没有将真实数据替换成演示数据。旧 E2E 未模拟的 API 请求已在 fixture 中封闭，避免模拟流程触达本地真实账本。

首轮预算测试出现 5 秒超时，独立复跑及限制 worker 后全套通过；旧浏览器选择器已适配导航分组、私密名称和新手机全部功能入口。修复发现的汇率表格手机溢出和 Tooltip 退出时的重排问题后重新巡检。

并行运行两套浏览器验收时曾出现 Chromium ERR_NO_BUFFER_SPACE，改为依次运行；成功提示重叠导致的测试定位歧义也已修正，并增加恢复后离开回收站的断言。折叠侧栏改用固定视口截图，避免全页截图临时调整视口触发响应式状态变化，并断言截图前后仍折叠、点击后展开。功能 E2E 完整重跑通过；UI 全套中的剩余失败项修正后独立复验通过。

## 14. Chromium 截图与视觉基线

共保存 ${screenshots.length} 张 PNG（报告生成时计数）。全站图库：[gallery.html](../verification/ui/gallery.html)。原始页面巡检数据见 light/dark/mobile/private/wide-audit.json；自动判定包含页面标题、无错误提示、无页面级溢出，隐私模式无 canvas。正常表格内部滚动不判为页面溢出。

| 原观察 | 改造后证据 |
| --- | --- |
| 首页仅四项核心数字、规划信息靠前 | 六项原 API 数字、趋势优先、规划可折叠 |
| 手机汇率页整页溢出 | mobile-settings-currencies.png，表格内部滚动 |
| 分组/嵌套路由无法准确定位 | dark-transactions.png 与二级入口巡检 |
| 账户/备注/比例隐私缺口 | private-dashboard.png、private-transactions.png |
| 弹层视觉不一致 | dark-form-*.png、mobile-form-*.png |

未在修改前保留同一账本、同一视口的全站截图，现有 backend/test-results 的历史图来自其他阶段/样本，不能作为严格像素对照。本次形成新的全站基线；没有宣称已完成改造前后同数据像素回归。

## 15. 未解决问题与验收边界

1. 实际账本中的空模块不能覆盖每个已结算、撤销、冲突、错误、退款、授权和专项分摊状态；这部分需要阶段 Z 隔离数据库样本验收。读操作和已有模拟金融流程已验证，未为截图制造真实数据。
2. 尚无改造前同数据全站图，完整像素回归应以本次稳定截图建立后续基线。
3. WCAG 目标已落实基础语义与键盘改进，未执行独立读屏软件、所有控件对比度和真实 200% 浏览器缩放认证。
4. chunk 大小提示保留；未重构前端/后端架构，也未迁移数据。
5. 隐私模式的全部专项多状态/附件内容仍需隔离样本矩阵；本次自动检查图表与已识别文本展示，不把截图无金额等同于全生命周期安全认证。

## 16. 阶段 Z 建议

在隔离库补齐 F/G 各资金状态、冲突与恢复样本；建立正式视觉回归基线和读屏验收；核对真实缩放与 Safari/移动浏览器；按实际测量评估资源拆分；随后按原发布和备份恢复流程验收。当前 UI 阶段没有执行正式发布、数据库迁移或项目清理。
`;
fs.writeFileSync(path.join(root, 'docs/Personal Finance 测试版 2.1.0 - 066 - UIUX交付报告.md'), report);
console.log(JSON.stringify({ routes: routeRows.length, tsxFiles: inventory.length, screenshots: screenshots.length, report: 'docs/Personal Finance 测试版 2.1.0 - 066 - UIUX交付报告.md' }));
