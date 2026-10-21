import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1, timeout: 120_000,
  outputDir: process.env.KHR_BROWSER_OUTPUT ?? './browser-results',
  reporter: [['list'], ['html', { outputFolder: process.env.KHR_BROWSER_REPORT ?? './browser-report', open: 'never' }]],
  use: { viewport: { width: 1200, height: 850 }, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    serviceWorkers: 'block', browserName: process.env.KHR_BROWSER_ENGINE === 'firefox' ? 'firefox' : 'chromium', launchOptions: { args: process.env.KHR_BROWSER_ENGINE === 'firefox' ? [] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-unsafe-webgpu'] } },
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1 --port 5186 --strictPort', url: 'http://127.0.0.1:5186', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev --prefix ../converter -- --host 127.0.0.1 --port 5187 --strictPort', url: 'http://127.0.0.1:5187', reuseExistingServer: !process.env.CI },
  ],
});
