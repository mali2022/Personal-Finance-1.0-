import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Multi-step Ant Design forms exceed five seconds on the local Windows
    // baseline. Keep assertions intact and bound suite contention explicitly.
    maxWorkers: 1,
    testTimeout: 30000,
  },
});
