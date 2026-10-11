import { writeFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

const storageKey = 'dito-forge:local:v1'
const expectedDistribution = [
  { tier: 'PERFECT', count: '3/49', percentage: '6.12%' },
  { tier: 'GREAT', count: '8/49', percentage: '16.33%' },
  { tier: 'GOOD', count: '4/49', percentage: '8.16%' },
  { tier: 'NORMAL', count: '0/49', percentage: '0.00%' },
  { tier: 'BURST', count: '34/49', percentage: '69.39%' },
] as const

type JourneyState = {
  label: string
  online: boolean
  score: string
  remaining: string | null
  hand: string[]
  integrity: string | null
  exactTiers: Array<{ tier: string | null; count: string; percentage: string }>
  recommendationVisible: boolean
  rankInventory: Record<string, string>
  visiblePoolLabel: string | null
  verifiedRemainingCount: number | null
  syncState: string | null
  savedDraws: string[] | null
  savedRoundStatus: string | null
}

async function captureState(page: Page, label: string): Promise<JourneyState> {
  return page.evaluate(({ storageKey, label }) => {
    const envelope = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as {
      session?: {
        syncState?: string
        verifiedRemainingCount?: number
        rounds?: Array<{ draws?: string[]; status?: string }>
      }
    } | null
    return {
      label,
      online: navigator.onLine,
      score: document.querySelector('[data-testid="current-score"]')?.textContent?.trim() ?? '',
      remaining: document.querySelector('[data-testid="remaining-total"]')?.textContent?.trim()
        ?? document.querySelector('.remaining-verification__result')?.textContent?.match(/工具依紀錄推算 (\d+) 顆/)?.[1]
        ?? null,
      hand: [...document.querySelectorAll('.summary__chips .stone-chip')].map((chip) => chip.textContent?.trim() ?? ''),
      integrity: document.querySelector('.deck-integrity-status h2')?.textContent?.trim()
        ?? document.querySelector('.unsynced-guidance h2')?.textContent?.trim()
        ?? null,
      exactTiers: [...document.querySelectorAll('[data-tier-probability]')].map((node) => ({
        tier: node.getAttribute('data-tier-probability'),
        count: node.closest('[data-tier]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        percentage: node.textContent?.trim() ?? '',
      })),
      recommendationVisible: Boolean(document.querySelector('[aria-label="本局建議"]')),
      rankInventory: Object.fromEntries([...document.querySelectorAll('[data-rank-key]')].map((key) => [
        key.getAttribute('data-rank-key') ?? '', key.querySelector('.keypad__remaining')?.textContent?.trim() ?? '',
      ])),
      visiblePoolLabel: document.querySelector('.deck-status')?.getAttribute('aria-label') ?? null,
      verifiedRemainingCount: envelope?.session?.verifiedRemainingCount ?? null,
      syncState: envelope?.session?.syncState ?? null,
      savedDraws: envelope?.session?.rounds?.at(-1)?.draws ?? null,
      savedRoundStatus: envelope?.session?.rounds?.at(-1)?.status ?? null,
    }
  }, { storageKey, label })
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name)
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

test('本機離線跨局記錄、重新連線持久化與未同步核對完整旅程', async ({ page, context }, testInfo) => {
  const states: JourneyState[] = []

  // Load and initialize first. This journey verifies operation after the loaded page loses connectivity.
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 52')
  await context.setOffline(true)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)

  for (const rank of ['4', '7', '6']) await page.locator(`[data-rank-key="${rank}"]`).click()
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  for (const result of expectedDistribution) {
    const row = page.locator(`[data-tier="${result.tier}"]`)
      .filter({ has: page.locator(`[data-tier-probability="${result.tier}"]`) })
    await expect(row).toContainText(result.count)
    await expect(row.locator(`[data-tier-probability="${result.tier}"]`)).toHaveText(result.percentage)
  }
  states.push(await captureState(page, 'offline-4-7-6-exact-distribution'))
  await screenshot(page, testInfo, 'offline-exact-distribution.png')

  await page.getByRole('button', { name: '撤銷輸入' }).click()
  await expect(page.getByTestId('current-score')).toHaveText('11/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 50')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7'])
  await page.locator('[data-rank-key="6"]').click()
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')

  await page.getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
  await expect(page.locator('.round-finished')).toContainText('牌池保留在剩 49 顆')
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])
  await page.getByRole('button', { name: '開始新局' }).click()
  await expect(page.locator('.summary__chips .stone-chip')).toHaveCount(0)
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  for (const rank of ['4', '7', '6']) {
    await expect(page.locator(`[data-rank-key="${rank}"]`)).toContainText('剩 3')
  }
  states.push(await captureState(page, 'offline-new-round-still-49'))

  await context.setOffline(false)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
  await page.reload()
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveCount(0)
  for (const rank of ['4', '7', '6']) {
    await expect(page.locator(`[data-rank-key="${rank}"]`)).toContainText('剩 3')
  }
  states.push(await captureState(page, 'online-reload-local-persistence'))

  await page.locator('.remaining-verification summary').click()
  await page.getByRole('textbox', { name: '遊戲畫面目前剩幾顆？' }).fill('48')
  await page.getByRole('button', { name: '核對' }).click()
  await expect(page.getByRole('heading', { name: '目前不能保證精確機率' })).toBeVisible()
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await expect(page.locator('.probability__rows [data-tier]')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '本局建議' })).toHaveCount(0)
  await expect(page.locator('[data-rank-key="4"]')).toContainText('推定剩 3')
  await expect(page.locator('[data-rank-key="7"]')).toContainText('推定剩 3')
  await expect(page.locator('[data-rank-key="6"]')).toContainText('推定剩 3')
  await expect(page.getByRole('button', { name: '剩餘牌池 49 / 52' })).toBeVisible()
  await expect(page.locator('.remaining-verification__result')).toContainText('工具依紀錄推算 49 顆')
  await expect(page.locator('.remaining-verification').getByRole('status')).toContainText('遊戲核對目標 48 顆，工具依紀錄推算 49 顆')
  const inventory = await page.locator('[data-rank-key]').evaluateAll((keys) => Object.fromEntries(keys.map((key) => [
    key.getAttribute('data-rank-key'), key.querySelector('.keypad__remaining')?.textContent?.trim(),
  ])))
  expect(inventory).toEqual({ A: '推定剩 4', '2': '推定剩 4', '3': '推定剩 4', '4': '推定剩 3', '5': '推定剩 4', '6': '推定剩 3', '7': '推定剩 3', '8': '推定剩 4', '9': '推定剩 4', '10': '推定剩 16' })
  states.push(await captureState(page, 'online-verify-48-unsynced-no-estimated-subtraction'))
  await screenshot(page, testInfo, 'online-unsynced-after-verify-48.png')

  const evidence = {
    ticket: '20261008-12-local-v1-acceptance',
    scope: 'browser session offline after initial page load; local persistence and UI integrity only',
    coverage: [
      'spec §5 E2E: PC 4/7/6 -> 17, remaining 49, exact five-tier distribution -> finish -> new round still 49',
      'spec §5 E2E: reload preserves local in-progress state',
      'spec §5 E2E: sync anomaly hides exact probability and recommendation',
      'spec §5 T02/T03/T16; T14 subset: one undo and re-entry, not undo-to-empty; T19 subset: online reload of new round, not import/export; T24 subset: loaded-page offline input/undo/carryover only, not offline reload, queue delivery or cloud snapshot equality',
      'AC-06: verifying game remaining 48 against recorded 49 marks UNSYNCED without guessing a rank to deduct',
    ],
    excludedClaims: ['first-visit offline restart', 'PWA/offline asset caching', 'cloud upload or remote snapshot equality', 'one-handed human usability'],
    project: testInfo.project.name,
    states,
  }
  const evidencePath = testInfo.outputPath('ticket12-journey-evidence.json')
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await testInfo.attach('ticket12-journey-evidence.json', { path: evidencePath, contentType: 'application/json' })
})
