import { defineConfig } from '@playwright/test';

// 设计系统 v2 视觉基线：只截图，不做像素断言（比对由人工/后续像素差脚本完成）。
// 数据来自 dev server + MSW，不接触真实账本。
export default defineConfig({
  testDir: './e2e-visual',
  fullyParallel: false,
  workers: 1,
  // 首次访问某个路由会触发 vite 依赖预构建，偶发 15s 以上的首屏等待；基线图确定性由固定时钟与固定 mock 保证，允许一次重试。
  retries: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  outputDir: './verification/visual-baseline/traces',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js --configLoader runner --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
