import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: 'production.spec.ts', fullyParallel: false,
  reporter: 'list', outputDir: '../../../../test-results/D1-hosted',
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
})

