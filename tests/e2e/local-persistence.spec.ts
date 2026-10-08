import { expect, test, type Page } from '@playwright/test'

const storageKey = 'dito-forge:local:v1'
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const
const probabilities = [
  { tier: 'PERFECT', count: '3/49', percentage: '6.12%' },
  { tier: 'GREAT', count: '8/49', percentage: '16.33%' },
  { tier: 'GOOD', count: '4/49', percentage: '8.16%' },
  { tier: 'NORMAL', count: '0/49', percentage: '0.00%' },
  { tier: 'BURST', count: '34/49', percentage: '69.39%' },
] as const

async function beginRecording(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
}

async function recordExample(page: Page) {
  for (const rank of ['4', '7', '6']) await page.locator(`[data-rank-key="${rank}"]`).click()
}

async function finishRound(page: Page) {
  await page.getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
}

async function readEnvelope(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey)
}

async function expectExampleRestored(page: Page) {
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await expect(page.getByText('僅本機：紀錄只儲存於此瀏覽器，未啟用雲端備份。')).toBeVisible()
  await expect(page.getByText(/雲端已備份|BACKED_UP/)).toHaveCount(0)
  for (const result of probabilities) {
    const row = page.locator(`[data-tier="${result.tier}"]`)
      .filter({ has: page.locator('[data-tier-probability]') })
    await expect(row).toContainText(result.count)
    await expect(row.locator(`[data-tier-probability="${result.tier}"]`)).toHaveText(result.percentage)
  }
}

async function capture(page: Page, testInfo: { project: { name: string } }, state: string) {
  await page.screenshot({
    path: `/tmp/dv3-ticket05-qa/screenshots/${testInfo.project.name}-${state}.png`,
    fullPage: true,
  })
}

test('三顆完成本局後重載，恢復歷史、分數與剩餘數', async ({ page }, testInfo) => {
  await beginRecording(page)
  await recordExample(page)
  await expectExampleRestored(page)
  await finishRound(page)
  await expect(page.locator('.round-finished')).toContainText('牌池保留在剩 49 顆')

  const saved = await readEnvelope(page)
  expect(saved.session.schemaVersion).toBe(1)
  expect(saved.session.rounds[0].draws).toEqual(['4', '7', '6'])
  expect(JSON.stringify(saved)).not.toMatch(/probabilit|remainingTotal/)

  await page.reload()
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.locator('.round-finished')).toContainText('牌池保留在剩 49 顆')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])
  await expect(page.getByTestId('remaining-total')).toHaveCount(0)
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(0)
  await capture(page, testInfo, 'restored-finished-round')

  await page.getByRole('button', { name: '開始新局' }).click()
  await expect(page.locator('.summary__chips .stone-chip')).toHaveCount(0)
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  await expect(page.locator('[data-rank-key="A"]')).toContainText('剩 4')
  for (const rank of ['4', '7', '6']) await expect(page.locator(`[data-rank-key="${rank}"]`)).toContainText('剩 3')
  await expect(page.locator('[data-rank-key="10"]')).toContainText('剩 16')
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(5)
})

test('局中重載恢復 4、7、6 手牌、17 分與 49 顆且機率相同', async ({ page }, testInfo) => {
  await beginRecording(page)
  await recordExample(page)
  await expectExampleRestored(page)
  await page.reload()
  await expectExampleRestored(page)
  await expect(page.locator('.round-finished')).toHaveCount(0)
  await capture(page, testInfo, 'restored-active-round')
})

test('少於 15 顆完成回合後重載，下一局建立 52 顆週期且保留舊週期', async ({ page }) => {
  await beginRecording(page)
  for (const rank of ranks.slice(0, 9)) {
    for (let copy = 0; copy < 4; copy += 1) await page.locator(`[data-rank-key="${rank}"]`).click()
  }
  await page.locator('[data-rank-key="10"]').click()
  await page.locator('[data-rank-key="10"]').click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 14')
  await finishRound(page)

  await page.reload()
  await expect(page.locator('.round-finished')).toContainText('牌池保留在剩 14 顆')
  await page.getByRole('button', { name: '開始新局' }).click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 52')
  await expect(page.getByText(/上一局結束時剩 14 顆/)).toBeVisible()
  const saved = await readEnvelope(page)
  expect(saved.session.cycles).toHaveLength(2)
  expect(saved.session.rounds).toHaveLength(2)
})

test('補滿觀察回答「不是」重載後仍保留未同步狀態與隱藏的精確機率', async ({ page }) => {
  await beginRecording(page)
  for (const rank of ranks.slice(0, 9)) {
    for (let copy = 0; copy < 4; copy += 1) await page.locator(`[data-rank-key="${rank}"]`).click()
  }
  await page.locator('[data-rank-key="10"]').click()
  await page.locator('[data-rank-key="10"]').click()
  await finishRound(page)
  await page.getByRole('button', { name: '開始新局' }).click()
  await page.getByRole('button', { name: '不是' }).click()
  await expect(page.getByRole('heading', { name: '牌池未同步' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: '牌池未同步' })).toBeVisible()
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(0)
  await expect(page.locator('[data-rank-key]')).toHaveCount(10)
})

test('損毀 JSON 保留原字串與 raw download，重新讀取仍安全且無遊戲操作', async ({ page }, testInfo) => {
  const corrupt = '{bad'
  await page.goto('/')
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: corrupt })
  await page.reload()

  await expect(page.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
  await expect(page.getByRole('button', { name: '下載原始資料' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新讀取本機資料' })).toBeVisible()
  await expect(page.locator('[data-rank-key]')).toHaveCount(0)
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await capture(page, testInfo, 'corrupt-recovery')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載原始資料' }).click(),
  ])
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  let content = ''
  for await (const chunk of stream!) content += chunk.toString()
  expect(content).toBe(corrupt)
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(corrupt)

  await page.getByRole('button', { name: '重新讀取本機資料' }).click()
  await expect(page.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(corrupt)
})

test('未知 schema 版本顯示錯誤且不覆寫原 envelope', async ({ page }, testInfo) => {
  await beginRecording(page)
  const original = await readEnvelope(page)
  original.session.schemaVersion = 99
  const raw = JSON.stringify(original)
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: raw })
  await page.reload()

  await expect(page.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
  await expect(page.locator('[data-rank-key]')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(raw)
  await capture(page, testInfo, 'unsupported-version')
})

test('setItem 拋錯時不更新記憶體、停用遊戲操作並保留先前 raw JSON', async ({ page }, testInfo) => {
  await beginRecording(page)
  await page.locator('[data-rank-key="4"]').click()
  const previousRaw = await page.evaluate((key) => localStorage.getItem(key), storageKey)
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (candidate, value) {
      if (candidate === key) throw new DOMException('blocked', 'QuotaExceededError')
      return original.call(this, candidate, value)
    }
  }, storageKey)

  await page.locator('[data-rank-key="7"]').click()
  await expect(page.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
  await expect(page.locator('[data-rank-key]')).toHaveCount(0)
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下載原始資料' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(previousRaw)
  await capture(page, testInfo, 'write-failure')
})

test('getItem 拋錯時顯示儲存錯誤、不假裝空白且不提供虛構下載', async ({ page }) => {
  await page.context().addInitScript((key) => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = function (candidate) {
      if (candidate === key) throw new DOMException('blocked', 'SecurityError')
      return original.call(this, candidate)
    }
  }, storageKey)
  await page.goto('/')
  await page.reload()

  await expect(page.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
  await expect(page.locator('[data-rank-key]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下載原始資料' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新讀取本機資料' })).toBeVisible()
})

test('同一 browser context 的新分頁載入已保存 session', async ({ page, context }) => {
  await beginRecording(page)
  await recordExample(page)
  const reopened = await context.newPage()
  await reopened.goto('/')
  await expectExampleRestored(reopened)
  await reopened.close()
})

test('恢復頁在 320、375、768、1024、1440px 無溢位且按鈕至少 44px', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.evaluate((key) => localStorage.removeItem(key), storageKey)
    await page.reload()
    await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
    await recordExample(page)
    await page.evaluate((key) => localStorage.setItem(key, '{bad'), storageKey)
    await page.reload()

    await expect(page.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
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
    expect(layout.buttons.length).toBeGreaterThan(0)
    for (const size of layout.buttons) {
      expect(size.width, `button narrower than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
      expect(size.height, `button shorter than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByRole('button', { name: '重新讀取本機資料' })).toBeVisible()
    await expect(page.getByRole('button', { name: '下載原始資料' })).toBeVisible()
  }
})

test('錯誤狀態可用鍵盤聚焦並以 Enter 重新讀取', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((key) => localStorage.setItem(key, '{bad'), storageKey)
  await page.reload()
  const retry = page.getByRole('button', { name: '重新讀取本機資料' })
  await retry.focus()
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
})

test('另一分頁已更新資料時，舊分頁拒絕覆寫並可重新讀取最新 session', async ({ context }) => {
  const firstPage = await context.newPage()
  await beginRecording(firstPage)
  await recordExample(firstPage)

  const stalePage = await context.newPage()
  await stalePage.goto('/')
  await expectExampleRestored(stalePage)

  await firstPage.locator('[data-rank-key="2"]').click()
  const latestRaw = await firstPage.evaluate((key) => localStorage.getItem(key), storageKey)
  await stalePage.locator('[data-rank-key="A"]').click()
  await expect(stalePage.getByRole('heading', { name: '本機資料暫時無法使用' })).toBeVisible()
  await expect(stalePage.locator('[data-rank-key]')).toHaveCount(0)
  expect(await stalePage.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(latestRaw)

  await stalePage.getByRole('button', { name: '重新讀取本機資料' }).click()
  await expect(stalePage.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6', '2'])
  await expect(stalePage.getByTestId('current-score')).toHaveText('19/21')
  await expect(stalePage.getByTestId('remaining-total')).toHaveText('剩 48')
  await expect(stalePage.locator('[data-rank-key="A"]')).toContainText('剩 4')
  await expect(stalePage.locator('[data-rank-key="2"]')).toContainText('剩 3')
})
