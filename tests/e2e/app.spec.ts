import { test, expect } from '@playwright/test'

test('首頁顯示工具名稱', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '迪特的鐵匠鋪機率計算器' })).toBeVisible()
})
