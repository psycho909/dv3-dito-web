import { expect, test, type Page } from '@playwright/test'

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const
const expectedDistribution = [
  { tier: 'PERFECT', count: '3/49', percentage: '6.12%' },
  { tier: 'GREAT', count: '8/49', percentage: '16.33%' },
  { tier: 'GOOD', count: '4/49', percentage: '8.16%' },
  { tier: 'NORMAL', count: '0/49', percentage: '0.00%' },
  { tier: 'BURST', count: '34/49', percentage: '69.39%' },
] as const

async function beginRecording(page: Page) {
  await page.goto('/')
  await expect(page.getByText('尚未開始記錄')).toBeVisible()
  await expect(page.getByRole('button', { name: /剩餘數未確認/ })).toHaveCount(10)
  await expect(page.getByText(/精確機率/)).toHaveCount(0)
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
}

async function record(page: Page, rank: string) {
  await page.locator(`[data-rank-key="${rank}"]`).click()
}

async function recordExample(page: Page) {
  await beginRecording(page)
  await record(page, '4')
  await expect(page.locator('[data-rank-key="4"]')).toContainText('剩 3')
  await record(page, '7')
  await expect(page.locator('[data-rank-key="7"]')).toContainText('剩 3')
  await record(page, '6')
}

test('確認從 52 開始後，4、7、6 顯示指定分數與五級距分布', async ({ page }, testInfo) => {
  await recordExample(page)

  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])
  for (const result of expectedDistribution) {
    const row = page.locator(`[data-tier="${result.tier}"]`).filter({ has: page.locator('[data-tier-probability]') })
    await expect(row).toContainText(result.count)
    await expect(row.locator(`[data-tier-probability="${result.tier}"]`)).toHaveText(result.percentage)
  }

  const project = testInfo.project.name
  const screenshotPath = `/tmp/dv3-ticket02-qa/screenshots/${project}-4-7-6.png`
  await page.screenshot({ path: screenshotPath, fullPage: true })
  const scrollbarColor = await page.locator('html').evaluate((element) => getComputedStyle(element).scrollbarColor)
  expect(scrollbarColor).not.toBe('auto')
})

test('同點數用罄後顯示剩 0、disabled 且不可再增加', async ({ page }) => {
  await beginRecording(page)
  for (let copy = 0; copy < 4; copy += 1) await record(page, '4')

  const fourKey = page.locator('[data-rank-key="4"]')
  await expect(fourKey).toContainText('剩 0')
  await expect(fourKey).toBeDisabled()
  await expect(page.getByTestId('current-score')).toHaveText('16/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 48')
})

test('A、10、2 依手牌順序保留並將分數重算為 13；21 點文案限定理論推算', async ({ page }) => {
  await beginRecording(page)
  await record(page, 'A')
  await record(page, '10')
  await record(page, '2')

  await expect(page.getByTestId('current-score')).toHaveText('13/21')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['A1/11', '10', '2'])
  await expect(page.getByText('A 會依規則採 1 或 11，自動計分。')).toBeVisible()

  await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
  await page.reload()
  await beginRecording(page)
  for (const rank of ['10', '10', 'A']) await record(page, rank)
  await expect(page.getByTestId('current-score')).toHaveText('21/21')
  await expect(page.getByText(/理論上的下一顆機率/)).toBeVisible()
  await expect(page.getByText(/不代表遊戲在 21 點或爆牌後仍允許繼續抽取/)).toBeVisible()
})

test('記完 52 顆顯示空牌池，不產生非有限數字且不自動補牌', async ({ page }) => {
  await beginRecording(page)
  for (const rank of ['10', '10', '2']) await record(page, rank)
  await expect(page.getByTestId('current-score')).toHaveText('22/21')
  await expect(page.getByText(/不代表遊戲在 21 點或爆牌後仍允許繼續抽取/)).toBeVisible()
  await record(page, '3')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['10', '10', '2', '3'])

  await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
  await page.reload()
  await beginRecording(page)
  for (const rank of ranks) {
    const copies = rank === '10' ? 16 : 4
    for (let copy = 0; copy < copies; copy += 1) await record(page, rank)
  }

  await expect(page.getByText('目前沒有可抽取的石頭')).toBeVisible()
  await expect(page.getByText('牌池剩餘 0 顆，沒有下一顆機率可供計算。')).toBeVisible()
  await expect(page.getByTestId('remaining-total')).toHaveCount(0)
  await expect(page.locator('[data-rank-key]')).toHaveCount(10)
  for (const rank of ranks) {
    const key = page.locator(`[data-rank-key="${rank}"]`)
    await expect(key).toContainText('剩 0')
    await expect(key).toBeDisabled()
  }
  await expect(page.locator('body')).not.toContainText(/NaN|Infinity/)
  await expect(page.locator('.forge-app')).not.toContainText('剩 52')
})

test('確認按鈕 Enter 後聚焦第一點數鍵，Enter 可以記錄', async ({ page }) => {
  await page.goto('/')
  const confirm = page.getByRole('button', { name: '確認從 52 顆開始記錄' })
  await confirm.focus()
  await page.keyboard.press('Enter')

  const firstRank = page.locator('[data-rank-key="A"]')
  await expect(firstRank).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['A1/11'])
  await expect(page.getByTestId('current-score')).toHaveText('11/21')
})

test('支援常用窄螢幕與桌面寬度、按鍵至少 44px 且沒有水平溢出', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
    await page.reload()
    await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
    for (const rank of ['4', '7', '6']) await record(page, rank)

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      keySizes: [...document.querySelectorAll<HTMLButtonElement>('.keypad__key')].map((key) => {
        const { width: keyWidth, height: keyHeight } = key.getBoundingClientRect()
        return { width: keyWidth, height: keyHeight }
      }),
      scrollbarColor: getComputedStyle(document.documentElement).scrollbarColor,
    }))
    expect(layout.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewportWidth)
    expect(layout.keySizes).toHaveLength(10)
    for (const size of layout.keySizes) {
      expect(size.width, `key narrower than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
      expect(size.height, `key shorter than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
    }
    expect(layout.scrollbarColor).not.toBe('auto')
  }
})
