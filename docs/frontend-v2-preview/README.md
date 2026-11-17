# 前端重构「完成态」视觉原型

这是 `docs/前端页面重构方案-20261103.md` 的配套示例：用**单文件静态 HTML**演示重构完成后前端应该长什么样、怎么组织。

- 文件：`index.html`（约 82KB，零依赖、零构建、可离线打开）
- 预览图：同目录 `preview-*.png`（Edge headless 实拍）
- 性质：**视觉与信息架构原型**，不是生产代码。生产实现按方案是 React 19 + TypeScript + antd 5 + TanStack Query。

## 打开方式

直接双击 `index.html`，或用任意静态服务器打开。支持演示用深链：

| URL | 效果 |
|---|---|
| `index.html` | 今日 / 总览（亮色） |
| `index.html?theme=dark` | 暗色主题 |
| `index.html?view=transactions` | 全部交易（工作台模板） |
| `index.html?view=reports` | 财务报告（报表模板） |
| `index.html?palette=1` | 命令面板 |
| `index.html?entry=1` | 记一笔抽屉 |
| `index.html?privacy=1` | 隐藏金额 |
| `index.html?view=payroll` | 薪酬 Hub（专项域模板） |

## 交互（都能点）

- 侧栏切换 7 个一级区 + 设置；移动端 390px 下自动变底部 Tab + 悬浮「记一笔」
- `⌘K` / `Ctrl+K`：命令面板，支持输入过滤、↑↓ 选择、Enter 执行
- `N`：记一笔；`T`：切换深浅色；`H`：隐藏/显示金额；`Esc`：关闭浮层
- 交易表格：全选 / 单选后在顶部出现批量操作条；点行打开详情抽屉
- 记一笔：金额输入实时校验（最多两位小数），非法时按钮禁用并提示
- 隐私模式：所有金额按 `.money` 统一打码（不透字、不泄漏宽度）

## 它对应方案里的哪些部分

| 原型中的东西 | 方案章节 | 说明 |
|---|---|---|
| 侧栏 / 顶栏 / 移动底栏 / 命令面板 | §4.3 §5 Stage 1 | 导航由路由清单派生，不再双份维护 |
| 今日（T1）、交易（T2）、报表（T3）、薪酬（T5） | §4.4 | 5 类页面模板，每类只写一次 |
| `@layer tokens, base, layout, components, views` | §4.6 | 固定级联顺序，0 个 `!important` |
| `--bg/--surface/--text/--blue…` 一组变量 | §4.6 | 单一令牌真源，亮暗只需换一组值 |
| `.money` + 隐私打码 | §4.7 公共件 1 | 替代 41 处 `toFixed` 与 101 处内联掩码 |
| 批量条 / 详情抽屉 / 筛选行 | §4.7 公共件 3、4 | `DataWorkspace` 的形状 |
| 金额输入即时校验 | §4.8 | `MoneyInput` 的规则示例 |
| 5 档断点、移动底部 Tab | §4.6 | 取代现状 30 个断点 |

## 刻意没做的

- 没有真实数据与网络层（生产由 `features/<domain>/{api,queries,mutations}` 提供）
- 没有图表库（生产用 echarts 按需注册；这里用内联 SVG 表达同样的视觉）
- 没有动画细节、表单联动、虚拟滚动（属于实现阶段）
