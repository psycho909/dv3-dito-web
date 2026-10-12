import { expect, test } from '@playwright/test'

test('版本紀錄可用鍵盤開關且手機與桌面都不水平溢出', async ({ page }) => {
  await page.goto('/')

  const trigger = page.getByRole('button', { name: '版本紀錄' })
  await expect(page.locator('.forge-app__footer-version').getByText('v1.12.0', { exact: true })).toBeVisible()
  await trigger.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: '版本紀錄' })
  await expect(dialog).toBeVisible()
  expect(await dialog.locator('h3').allTextContents()).toEqual([
    'v1.12.0', 'v1.11.1', 'v1.11.0', 'v1.10.0', 'v1.9.0', 'v1.8.0', 'v1.7.0', 'v1.6.0', 'v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.1', 'v1.2.0', 'v1.1.0', 'v1.0.0',
  ])
  await expect(dialog.getByText('2026-10-12').first()).toBeVisible()

  const close = dialog.getByRole('button', { name: '關閉版本紀錄' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await close.click()
  await expect(trigger).toBeFocused()
})
