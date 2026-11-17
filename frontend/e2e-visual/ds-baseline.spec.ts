import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// 一次运行产出一整套基线图；DS_WAVE / DS_MODE 决定落盘目录与 <html data-ds>。
const wave = process.env.DS_WAVE ?? 'wave-00';
const dsMode = process.env.DS_MODE ?? 'v1';
const outputDir = path.join('verification', 'visual-baseline', `${wave}-${dsMode}`);

const routes = [
  { slug: 'home', path: '/' },
  { slug: 'transactions', path: '/transactions' },
  { slug: 'accounts', path: '/accounts' },
  { slug: 'reports', path: '/reports' },
  { slug: 'bookkeeping-new', path: '/bookkeeping/new' },
  { slug: 'settings', path: '/settings' },
  { slug: 'reconciliation', path: '/reconciliation' },
  { slug: 'categories', path: '/categories' },
  { slug: 'import', path: '/import' },
  { slug: 'tags', path: '/tags' },
  { slug: 'projects', path: '/projects' },
  { slug: 'calendar', path: '/calendar' },
  { slug: 'recurring', path: '/recurring' },
  { slug: 'subscriptions', path: '/subscriptions' },
];

const shots = [
  { name: 'desktop-light', viewport: { width: 1440, height: 900 }, theme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1440, height: 900 }, theme: 'dark' },
  { name: 'mobile-light', viewport: { width: 390, height: 844 }, theme: 'light' },
  { name: 'mobile-dark', viewport: { width: 390, height: 844 }, theme: 'dark' },
];

// 受保护路由会跳 /login；MSW 的 /api/auth/login 用任意邮箱与非空密码放行。
async function signIn(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const email = page.locator('#email');
  try {
    await email.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    // 已是登录态时 /login 会直接跳走，此时无需再填表单。
    if (!new URL(page.url()).pathname.startsWith('/login')) return;
    throw new Error('登录表单在 30s 内未出现');
  }
  await email.fill('visual-baseline@example.com');
  await page.locator('#password').fill('visual-baseline');
  await page.locator('button.auth-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
}

fs.mkdirSync(outputDir, { recursive: true });

for (const shot of shots) {
  test.describe(shot.name, () => {
    test.use({ viewport: shot.viewport });

    for (const route of routes) {
      test(`${route.slug}`, async ({ page, context }) => {
        await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
        await page.addInitScript(
          ([theme, ds]) => {
            window.localStorage.setItem(
              'finance-ui',
              JSON.stringify({
                state: { language: 'zh-CN', hidden: false, theme, defaultAccount: '' },
                version: 0,
              }),
            );
            window.localStorage.setItem('pf-ds', ds);
          },
          [shot.theme, dsMode] as const,
        );
        // MSW 未注册的接口会被 onUnhandledRequest:'bypass' 放行到真实后端并拿到 401，
        // 拦截器随即派发 finance:unauthorized 把页面踢回 /login。这里与 e2e/fixtures.ts
        // 同款兜底：MSW 已处理的请求 SW 层拦下、不会到这里，走到这里的直接给确定性 503。
        // 只补 MSW 未注册的这两个数组接口：它们被 bypass 到真实后端拿到 401，
        // 拦截器随即派发 finance:unauthorized 把页面踢回 /login。
        await context.route(/\/api\/(account-groups|promotions)(\?|$)/, (route) =>
          route.fulfill({ status: 200, json: { data: [] } }),
        );
        await signIn(page);
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#root')).toBeVisible();
        // 仍被弹回登录说明会话没建立，此时截图没有参考价值 —— 直接失败。
        await expect(page).not.toHaveURL(/\/login/);
        await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
        await page.waitForTimeout(600);
        const file = path.join(outputDir, `${shot.name}-${route.slug}.png`);
        await page.screenshot({ path: file, fullPage: true });
        expect(fs.existsSync(file)).toBeTruthy();
      });
    }
  });
}
