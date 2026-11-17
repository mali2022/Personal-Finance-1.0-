import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'src');
const v2Tokens = path.join(src, 'design', 'v2-tokens.css');
const baselineFile = path.join(root, 'ds-baseline.json');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const init = flag('--init');
const writeJson = flag('--json');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });

const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const files = walk(src);
const tsx = files.filter((f) => f.endsWith('.tsx'));
const css = files.filter((f) => f.endsWith('.css'));
const read = (file) => fs.readFileSync(file, 'utf8');
const count = (list, pattern) =>
  list.reduce((sum, file) => sum + (read(file).match(pattern) ?? []).length, 0);

// 2) 作用域纪律 —— 只有 v2 层文件可以消费 --ds-*
// theme.ts 是 antd token 桥，它是 v2 值的唯一合法出口，和 v2 规则文件同等对待。
const isV2Layer = (file) =>
  rel(file) === 'src/design/v2-tokens.css' ||
  rel(file) === 'src/design/theme.ts' ||
  rel(file).startsWith('src/design/v2/');

// 4) 反模式棘轮 —— 只统计 v1 的表面：v2 层本身就是新代码，不该被旧债基线卡住。
const v1Files = (list) => list.filter((file) => !isV2Layer(file));
const metrics = {
  inlineStyle: count(v1Files(tsx), /style=\{\{/g),
  literalClassName: count(v1Files(tsx), /className="/g),
  antOverrides: count(v1Files(css), /\.ant-[a-z0-9-]+/g),
};

const errors = [];
const warnings = [];

// 1) 尺度 token 完整性 —— 契约：4 圆角 / 8 字阶 / 3 投影 / 8 间距
const tokens = read(v2Tokens);
const unique = (pattern) =>
  new Set([...tokens.matchAll(pattern)].map((m) => m[0].replace(':', ''))).size;
const groups = {
  '--ds-r-*': unique(/--ds-r-[a-z0-9]+:/g),
  '--ds-t-*': unique(/--ds-t-[0-9]+:/g),
  '--ds-e-*': unique(/--ds-e-[0-9]+:/g),
  '--ds-s-*': unique(/--ds-s-[0-9]+:/g),
};
const expected = { '--ds-r-*': 4, '--ds-t-*': 8, '--ds-e-*': 3, '--ds-s-*': 8 };
for (const [key, want] of Object.entries(expected))
  if (groups[key] !== want)
    errors.push(`token 完整性: ${key} 期望 ${want} 个，实际 ${groups[key]} 个`);

const offenders = files
  .filter((file) => /\.(tsx?|css)$/.test(file) && !isV2Layer(file))
  .filter((file) =>
    file.endsWith('.css')
      ? read(file).includes('--ds-')
      : read(file).includes('var(--ds-'),
  );
for (const file of offenders)
  errors.push(`作用域纪律: ${rel(file)} 在 v2 层之外引用 --ds-*（新规则必须走 [data-ds='v2'] 作用域文件）`);

// 3) 颜色纪律 —— v2 规则文件不得写死色值（token 文件与阴影除外）
for (const file of files.filter((f) => f.endsWith('.css') && rel(f).startsWith('src/design/v2/'))) {
  const source = read(file);
  for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g))
    errors.push(`颜色纪律: ${rel(file)} 出现字面色值 ${match[0]}`);
}

// 4) 反模式棘轮 —— 不得高于基线
let baseline = null;
if (fs.existsSync(baselineFile)) baseline = JSON.parse(read(baselineFile));
if (init) {
  fs.writeFileSync(baselineFile, JSON.stringify(metrics, null, 2) + '\n');
  baseline = metrics;
  console.log('已写入基线 ds-baseline.json:', JSON.stringify(metrics));
} else if (baseline) {
  for (const [key, value] of Object.entries(metrics))
    if (typeof baseline[key] === 'number' && value > baseline[key])
      errors.push(`反模式棘轮: ${key} 从 ${baseline[key]} 增至 ${value}（只允许下降）`);
} else {
  warnings.push('缺少 ds-baseline.json，棘轮检查跳过（首次请运行 node scripts/check-ds.mjs --init）');
}

// 5) 死规则报告 —— 波 5 清理依据
const classUses = new Set();
for (const file of tsx) for (const m of read(file).matchAll(/\.[a-z][a-z0-9-]{2,}/gi)) classUses.add(m[0].slice(1));
const deadSelectors = new Set();
for (const file of css) {
  const source = read(file).replaceAll('[data-theme=\'dark\']', '').replaceAll('[data-ds=\'v2\']', '');
  for (const m of source.matchAll(/\.([a-z][a-z0-9-]{3,})[\s,:{.]/gi)) {
    const name = m[1];
    if (!classUses.has(name)) deadSelectors.add(name);
  }
}
warnings.push(`v1 CSS 中无组件引用的类名 ${deadSelectors.size} 个（波 5 清理候选，详见 --json 输出）`);

const summary = {
  tokens: groups,
  metrics,
  baseline,
  errors,
  warnings,
  deadSelectors: [...deadSelectors].sort(),
};
if (writeJson) {
  const out = path.join(root, 'verification');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'ds-audit.json'), JSON.stringify(summary, null, 2) + '\n');
}

console.log('设计系统 v2 审计');
for (const [key, value] of Object.entries(groups))
  console.log(`  token ${key}: ${value}（契约 ${expected[key]}）`);
console.log('  反模式指标:', JSON.stringify(metrics), '基线:', baseline ? JSON.stringify(baseline) : '未建立');
for (const line of warnings) console.log('  warn: ' + line);
for (const line of errors.slice(0, 12)) console.log('  error: ' + line);
if (errors.length > 12) console.log(`  … 另有 ${errors.length - 12} 条 error`);
console.log(errors.length === 0 ? '结果: 通过（0 error）' : `结果: 失败（${errors.length} error）`);
process.exit(errors.length === 0 ? 0 : 1);
