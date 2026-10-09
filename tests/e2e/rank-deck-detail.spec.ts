import { expect, test } from '@playwright/test'

test('逐點數明細沿用 4、7、6 的牌池結果並可鍵盤收合與返回焦點', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  for (const rank of ['4', '7', '6']) await page.locator(`[data-rank-key="${rank}"]`).click()

  const detailToggle = page.getByRole('button', { name: '展開逐點數明細' })
  await expect(detailToggle).not.toHaveAttribute('aria-controls')
  await detailToggle.focus()
  await page.keyboard.press('Enter')
  const detail = page.getByRole('region', { name: '逐點數結果明細' })
  await expect(detail).toBeVisible()
  const outcomes = [
    ['A', '4/49', '8.16%', '18', 'GOOD'],
    ['2', '4/49', '8.16%', '19', 'GREAT'],
    ['3', '4/49', '8.16%', '20', 'GREAT'],
    ['4', '3/49', '6.12%', '21', 'PERFECT'],
    ['5', '4/49', '8.16%', '22', 'BURST'],
    ['6', '3/49', '6.12%', '23', 'BURST'],
    ['7', '3/49', '6.12%', '24', 'BURST'],
    ['8', '4/49', '8.16%', '25', 'BURST'],
    ['9', '4/49', '8.16%', '26', 'BURST'],
    ['10', '16/49', '32.65%', '27', 'BURST'],
  ]
  await expect(detail.locator('[data-rank-outcome]')).toHaveCount(10)
  for (const [rank, remaining, probability, nextScore, tier] of outcomes) {
    const outcome = detail.locator(`[data-rank-outcome="${rank}"]`)
    for (const value of [rank, remaining, probability, nextScore, tier]) {
      await expect(outcome).toContainText(value)
    }
  }

  await page.getByRole('button', { name: '收合逐點數明細' }).focus()
  await page.keyboard.press('Enter')
  await expect(detail).toHaveCount(0)
  await expect(detailToggle).toBeFocused()
})

test('牌池抽屜顯示手動記錄說明，Escape 關閉並將焦點還給開啟鈕', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  for (const rank of ['4', '7', '6']) await page.locator(`[data-rank-key="${rank}"]`).click()

  const opener = page.getByRole('button', { name: '剩餘牌池 49 / 52' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const drawer = page.getByRole('dialog', { name: '剩餘牌池明細' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: '關閉牌池明細' })).toBeFocused()
  await expect(drawer).toContainText('各點數數量依你手動記錄推算，不會從遊戲自動讀取。')
  await expect(drawer.locator('[data-deck-rank]')).toHaveCount(10)
  await expect(drawer.locator('[data-deck-rank="4"]')).toContainText('3')
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('375px 明細與牌池抽屜不造成水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  for (const rank of ['4', '7', '6']) await page.locator(`[data-rank-key="${rank}"]`).click()
  await page.getByRole('button', { name: '展開逐點數明細' }).click()
  await page.getByRole('button', { name: '剩餘牌池 49 / 52' }).click()
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    detail: (() => {
      const element = document.querySelector('.rank-detail__content')
      return element ? { scroll: element.scrollWidth, client: element.clientWidth } : null
    })(),
    drawer: (() => {
      const element = document.querySelector('.deck-drawer')
      return element ? { scroll: element.scrollWidth, client: element.clientWidth } : null
    })(),
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  expect(widths.detail).not.toBeNull()
  expect(widths.drawer).not.toBeNull()
  expect(widths.detail?.scroll).toBeLessThanOrEqual(widths.detail?.client ?? 0)
  expect(widths.drawer?.scroll).toBeLessThanOrEqual(widths.drawer?.client ?? 0)
})
