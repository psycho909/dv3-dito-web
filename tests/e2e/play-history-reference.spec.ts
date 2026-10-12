import { expect, test } from '@playwright/test'

test('分析分頁可用方向鍵切換並記住選擇，顯示遊玩代幣換算', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('dito-forge:analysis-tab'))
  await page.reload()

  const nextTab = page.getByRole('tab', { name: '下一顆' })
  await expect(nextTab).toHaveAttribute('aria-selected', 'true')
  await nextTab.focus()
  await page.keyboard.press('ArrowRight')
  const roundTab = page.getByRole('tab', { name: '本局預估' })
  await expect(roundTab).toBeFocused()
  await expect(roundTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')

  const tokenTab = page.getByRole('tab', { name: '遊玩代幣' })
  await expect(tokenTab).toBeFocused()
  await expect(tokenTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('play-history-reference')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('dito-forge:analysis-tab'))).toBe('tokens')
  await expect(page.getByTestId('multiplier-reference').locator('[data-multiplier]')).toHaveCount(7)
  await page.getByRole('button', { name: '填入 6,000 遊玩代幣' }).click()
  await expect(page.getByTestId('play-token-estimates')).toContainText('600 場（x1 計）')
  await expect(page.getByTestId('baseline-token-total')).toContainText('20,531 分')
  const chipLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    labels: [...document.querySelectorAll('[data-testid="multiplier-reference"] li')]
      .flatMap((chip) => [...chip.children])
      .map((label) => ({
        text: label.textContent?.trim(),
        whiteSpace: getComputedStyle(label).whiteSpace,
        scrollWidth: label.scrollWidth,
        clientWidth: label.clientWidth,
      })),
  }))
  expect(chipLayout.pageWidth).toBeLessThanOrEqual(chipLayout.viewportWidth)
  for (const label of chipLayout.labels) {
    expect(label.whiteSpace, `${label.text} must stay on one line`).toBe('nowrap')
    expect(label.scrollWidth, `${label.text} must fit the multiplier chip`).toBeLessThanOrEqual(label.clientWidth)
  }
})

test('375px 進行中六顆時完整資訊頁高度不超過 1,300px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('dito-forge:local:v1')
    localStorage.removeItem('dito-forge:analysis-tab')
  })
  await page.reload()
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  for (const rank of ['A', '2', '2', '3', '3', '4']) {
    await page.locator(`[data-rank-key="${rank}"]`).click()
  }
  await expect(page.getByTestId('current-score')).toHaveText('15/21')

  const layout = await page.evaluate(() => ({
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    blocks: [...document.querySelectorAll('.forge-app > *, .forge-app__results > *, .forge-app__lower > *')]
      .filter((element) => element.getBoundingClientRect().height > 0)
      .map((element) => ({
        selector: element.className || element.tagName,
        top: Math.round(element.getBoundingClientRect().top + window.scrollY),
        height: Math.round(element.getBoundingClientRect().height),
      })),
  }))
  await testInfo.attach('375px-active-page-height', {
    body: `${layout.height}px`,
    contentType: 'text/plain',
  })
  testInfo.annotations.push({ type: 'measured-page-height', description: `${layout.height}px` })
  expect(layout.height, JSON.stringify(layout)).toBeLessThanOrEqual(1300)
})
