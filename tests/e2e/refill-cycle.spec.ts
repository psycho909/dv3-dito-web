import { expect, test, type Page } from '@playwright/test'

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const

async function beginRecording(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
}

async function record(page: Page, rank: string) {
  await page.locator(`[data-rank-key="${rank}"]`).click()
}

async function consumeFifteen(page: Page) {
  // A..9 各四顆共 36，再抽一顆 10：消耗 37，留下 15。
  for (const rank of ranks.slice(0, 9)) {
    for (let copy = 0; copy < 4; copy += 1) await record(page, rank)
  }
  await record(page, '10')
}

async function consumeThirtyEight(page: Page) {
  // A..9 各四顆共 36，再抽兩顆 10：消耗 38，留下 14。
  for (const rank of ranks.slice(0, 9)) {
    for (let copy = 0; copy < 4; copy += 1) await record(page, rank)
  }
  await record(page, '10')
  await record(page, '10')
}

async function finishAndStart(page: Page) {
  await page.getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('button', { name: '開始新局' }).click()
}

async function capture(page: Page, name: string, project: string) {
  await page.screenshot({
    path: `/tmp/dv3-ticket04-qa/screenshots/${project}-${name}.png`,
    fullPage: true,
  })
}

test('剩 15 時本局不補滿、開始新局沿用 15 且不出現補滿觀察', async ({ page }, testInfo) => {
  await beginRecording(page)
  await consumeFifteen(page)
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 15')
  await expect(page.getByText('下局預計補滿')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '開始新局' })).toHaveCount(0)
  await capture(page, 'remaining-15-active', testInfo.project.name)

  await finishAndStart(page)
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 15')
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '是' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '不是' })).toHaveCount(0)
  await expect(page.locator('[data-rank-key="10"]')).toContainText('剩 15')
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(5)
  await capture(page, 'remaining-15-new-round', testInfo.project.name)
})

test('局中剩 14 只提示下局補滿；新局才以 52 開始並詢問觀察', async ({ page }, testInfo) => {
  await beginRecording(page)
  await consumeThirtyEight(page)
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 14')
  await expect(page.getByText('下局預計補滿')).toBeVisible()
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toHaveCount(0)
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(5)
  await capture(page, 'remaining-14-active', testInfo.project.name)

  await finishAndStart(page)
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 52')
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toBeVisible()
  await expect(page.getByRole('button', { name: '是，顯示 52 顆' })).toBeVisible()
  await expect(page.getByRole('button', { name: '不是' })).toBeVisible()
  await expect(page.getByRole('button', { name: '稍後' })).toBeVisible()
  await expect(page.getByText(/上一局結束時剩 14 顆/)).toBeVisible()
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveCount(0)
  await expect(page.locator('[data-rank-key="A"]')).toContainText('剩 4')
  await expect(page.locator('[data-rank-key="10"]')).toContainText('剩 16')
  await capture(page, 'new-cycle-observation-prompt', testInfo.project.name)
})

test('稍後收起問題並可重新開啟；鍵盤可回答是並標示觀察結果', async ({ page }, testInfo) => {
  await beginRecording(page)
  await consumeThirtyEight(page)
  await finishAndStart(page)
  const later = page.getByRole('button', { name: '稍後' })
  await later.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toHaveCount(0)
  const reopen = page.getByRole('button', { name: /確認補滿情形/ })
  await expect(reopen).toBeVisible()
  await reopen.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toBeVisible()
  await capture(page, 'observation-later-pending', testInfo.project.name)

  const yes = page.getByRole('button', { name: '是，顯示 52 顆' })
  await yes.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toHaveCount(0)
  await expect(page.getByText(/已確認|CONFIRMED_52/)).toBeVisible()
  await capture(page, 'observation-confirmed', testInfo.project.name)
})

test('回答不是後明確標示 UNSYNCED，隱藏所有精確百分比與牌池抽取按鍵仍可見', async ({ page }, testInfo) => {
  await beginRecording(page)
  await consumeThirtyEight(page)
  await finishAndStart(page)
  await page.getByRole('button', { name: '不是' }).click()

  await expect(page.getByRole('heading', { name: '牌池未同步' })).toBeVisible()
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(0)
  await expect(page.locator('[data-rank-key]')).toHaveCount(10)
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toHaveCount(0)
  await record(page, 'A')
  await expect(page.locator('[data-rank-key="A"]')).toContainText('推定剩 3')
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await page.getByRole('button', { name: '撤銷輸入' }).click()
  await expect(page.locator('[data-rank-key="A"]')).toContainText('推定剩 4')
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)

  await finishAndStart(page)
  await expect(page.locator('[data-rank-key="A"]')).toContainText('推定剩 4')
  await expect(page.getByRole('heading', { name: '目前不能保證精確機率' })).toBeVisible()
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(0)
  await capture(page, 'observation-denied-unsynced', testInfo.project.name)
})

test('確認新週期的補滿觀察狀態', async ({ page }, testInfo) => {
  await beginRecording(page)
  await consumeThirtyEight(page)
  await finishAndStart(page)
  await expect(page.getByText(/上一局結束時剩 14 顆/)).toBeVisible()
  await page.getByRole('button', { name: '是，顯示 52 顆' }).click()

  await expect(page.getByRole('heading', { name: '已確認遊戲顯示 52 顆' })).toBeVisible()
  await expect(page.getByText('這次補滿情形已由你確認。')).toBeVisible()
  await capture(page, 'observation-confirmed-cycle', testInfo.project.name)
})

test('週期提示與可見操作在指定寬度不溢出且操作至少 44px', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await beginRecording(page)
    await consumeThirtyEight(page)
    await finishAndStart(page)

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll<HTMLButtonElement>('button')]
        .filter((button) => button.getClientRects().length > 0)
        .map((button) => {
        const rect = button.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    }))
    expect(layout.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewportWidth)
    for (const size of layout.buttons) {
      expect(size.width, `button narrower than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
      expect(size.height, `button shorter than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toBeVisible()
  }
})

test('reduced-motion 偏好下週期觀察提示可操作', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await beginRecording(page)
  await consumeThirtyEight(page)
  await finishAndStart(page)
  await expect(page.getByText('遊戲現在顯示 52 顆嗎？')).toBeVisible()
  await capture(page, 'new-cycle-reduced-motion', testInfo.project.name)
})
