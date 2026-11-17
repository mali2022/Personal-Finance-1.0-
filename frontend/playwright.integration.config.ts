import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './integration',
  testIgnore: [
    'financial-planning-d.spec.ts',
    'batch-c2.spec.ts',
    'planning-b.spec.ts',
    'operations-a2.spec.ts',
    'categories-a32.spec.ts',
    'imports-a331.spec.ts',
    'imports-a332.spec.ts',
    'budgets-a34.spec.ts',
    'budget-history-a341.spec.ts',
    'performance-a35.spec.ts',
  ],
  workers: 1,
  timeout: 45000,
  outputDir: 'test-results/real-api',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js --configLoader runner --mode integration --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
  },
});

