import { expect, test, type Page } from '@playwright/test'

const depleted = ['A', '2', '3', '4', '5', '6', '7', '8', '9']
  .flatMap((rank) => Array(4).fill(rank)).concat(['10', '10'])
const initialDeck = { A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4, '10': 16 }

function fixture(confirmed = false) {
  return JSON.stringify({
    session: {
      schemaVersion: 1, syncState: 'SYNCED', activeRoundId: 'round-2',
      cycles: [
        { id: 'cycle-1', initialDeck, reason: 'USER_CONFIRMED_FULL', startedAt: '2026-10-11T09:00:00.000Z' },
        { id: 'cycle-2', initialDeck, reason: 'BELOW_15_NEXT_ROUND', startedAt: '2026-10-11T09:02:00.000Z',
          triggeredByRoundId: 'round-2', previousRemaining: 14,
          ...(confirmed ? { observation: 'CONFIRMED_52', observedAt: '2026-10-11T09:02:10.000Z' } : {}),
        },
      ],
      rounds: [
        { id: 'round-1', cycleId: 'cycle-1', status: 'FINISHED', draws: depleted,
          startedAt: '2026-10-11T09:00:00.000Z', finishedAt: '2026-10-11T09:01:00.000Z' },
        { id: 'round-2', cycleId: 'cycle-2', status: 'ACTIVE', draws: ['10'], startedAt: '2026-10-11T09:02:00.000Z' },
      ],
    },
    deviceId: '11111111-1111-4111-8111-111111111111', lastAcknowledgedCloudRevision: 0, pendingMutationBatches: [],
  })
}

async function seed(page: Page, confirmed = false) {
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('dito-forge:local:v1')) localStorage.setItem('dito-forge:local:v1', raw)
  }, fixture(confirmed))
  await page.goto('/')
  await page.locator('[data-history-open]').click()
  await expect(page.locator('.history-drawer')).toBeVisible()
}

async function editFirst(page: Page, sequence: string) {
  const drawer = page.locator('.history-drawer')
  await drawer.getByRole('button', { name: /第\s*1\s*局/ }).click()
  await drawer.getByRole('textbox', { name: /抽牌序列/ }).fill(sequence)
  await drawer.getByRole('textbox', { name: '修正原因', exact: true }).fill('移除誤記的最後一顆')
  await drawer.getByRole('button', { name: '預覽修正', exact: true }).click()
}

test('T22：剩 14 修正為 16，先預覽移除推定邊界，確認後重讀正確庫存與稽核', async ({ page }) => {
  await seed(page)
  const rawBefore = await page.evaluate(() => localStorage.getItem('dito-forge:local:v1'))
  await editFirst(page, depleted.slice(0, -2).join(' '))
  const preview = page.locator('.history-drawer__preview')
  await expect(preview).toContainText('邊界移除')
  await expect(preview).toContainText('15 / 52')
  expect(await page.evaluate(() => localStorage.getItem('dito-forge:local:v1'))).toBe(rawBefore)
  await page.getByRole('button', { name: '套用修正', exact: true }).click()
  await expect(page.locator('.history-drawer')).toContainText('已套用修正')
  await page.reload()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dito-forge:local:v1') ?? 'null').session)
  expect(saved.cycles).toHaveLength(1)
  expect(saved.rounds[1].cycleId).toBe('cycle-1')
  expect(saved.corrections).toHaveLength(1)
  expect(saved.corrections[0].reason).toBe('移除誤記的最後一顆')
  await expect(page.locator('.deck-status')).toContainText('15 / 52')
})

test('T31：已確認 52 邊界固定，修正到 16 顆時預覽規則警告並保留', async ({ page }) => {
  await seed(page, true)
  await editFirst(page, depleted.slice(0, -2).join(' '))
  await expect(page.locator('.history-drawer__warnings')).toContainText('16')
  await expect(page.locator('.history-drawer__preview')).toContainText('51 / 52')
  await page.getByRole('button', { name: '仍套用修正並保留此邊界' }).click()
  await page.reload()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dito-forge:local:v1') ?? 'null').session)
  expect(saved.cycles[1].observation).toBe('CONFIRMED_52')
  expect(saved.cycles[1].previousRemaining).toBe(16)
  expect(saved.corrections[0].warnings[0].previousRemaining).toBe(16)
  await expect(page.locator('[data-history-open]')).toBeVisible()
})

test('T20：超抽指出衝突局，不顯示套用且保持原資料', async ({ page }) => {
  await seed(page)
  const raw = await page.evaluate(() => localStorage.getItem('dito-forge:local:v1'))
  await editFirst(page, `${depleted.join(' ')} A`)
  await expect(page.locator('.history-drawer__preview [role="alert"]')).toContainText(/第\s*1\s*局/)
  await expect(page.getByRole('button', { name: '套用修正', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('dito-forge:local:v1'))).toBe(raw)
})

test('修正欄位驗證、取消與 Escape 放棄提示，返回入口焦點且窄螢幕不溢出', async ({ page }) => {
  await seed(page)
  const drawer = page.locator('.history-drawer')
  await drawer.getByRole('button', { name: /第\s*1\s*局/ }).click()
  const sequence = drawer.getByRole('textbox', { name: /抽牌序列/ })
  await sequence.fill('JOKER')
  await drawer.getByRole('button', { name: '預覽修正', exact: true }).click()
  await expect(sequence).toBeFocused()
  await expect(sequence).toHaveAttribute('aria-invalid', 'true')
  await expect(sequence).toHaveValue('JOKER')
  await page.keyboard.press('Escape')
  await expect(drawer.getByText('尚有未套用修正')).toBeVisible()
  await drawer.getByRole('button', { name: '繼續編輯' }).click()
  await expect(sequence).toHaveValue('JOKER')
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  await drawer.getByRole('button', { name: '關閉歷史紀錄' }).click()
  await drawer.getByRole('button', { name: '放棄未套用修正並關閉' }).click()
  await expect(page.locator('[data-history-open]')).toBeFocused()
})

test('已核對同步的牌池修正後不符，保留目標且重載仍可開啟歷史', async ({ page }) => {
  const envelope = JSON.parse(fixture())
  envelope.session.cycles = envelope.session.cycles.slice(0, 1)
  envelope.session.rounds = [{
    id: 'round-1', cycleId: 'cycle-1', status: 'ACTIVE', draws: ['4'],
    startedAt: '2026-10-11T09:00:00.000Z',
  }]
  envelope.session.activeRoundId = 'round-1'
  envelope.session.verifiedRemainingCount = 51
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('dito-forge:local:v1')) localStorage.setItem('dito-forge:local:v1', raw)
  }, JSON.stringify(envelope))
  await page.goto('/')
  await page.locator('[data-history-open]').click()
  await editFirst(page, '')
  await expect(page.locator('.history-drawer__preview')).toContainText('修正後牌池：52 / 52；同步狀態 UNSYNCED')
  await page.getByRole('button', { name: '套用修正', exact: true }).click()
  await page.reload()
  await expect(page.locator('[data-history-open]')).toBeVisible()
  await expect(page.locator('.unsynced-guidance')).toBeVisible()
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dito-forge:local:v1') ?? 'null').session)
  expect(saved.syncState).toBe('UNSYNCED')
  expect(saved.verifiedRemainingCount).toBe(51)
  expect(saved.corrections).toHaveLength(1)
  await page.locator('[data-history-open]').click()
  await expect(page.locator('.history-drawer')).toBeVisible()
  await expect(page.locator('.history-drawer')).toContainText('移除誤記的最後一顆')
})

test('套用保存失敗保留原資料、關閉歷史並聚焦復原入口', async ({ page }) => {
  await seed(page)
  await editFirst(page, depleted.slice(0, -1).join(' '))
  const raw = await page.evaluate(() => localStorage.getItem('dito-forge:local:v1'))
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota') } })
  await page.getByRole('button', { name: '套用修正', exact: true }).click()
  await expect(page.locator('.history-drawer')).not.toBeVisible()
  await expect(page.getByRole('button', { name: '重新讀取本機資料' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('dito-forge:local:v1'))).toBe(raw)
  await page.reload()
  await expect(page.locator('[data-history-open]')).toBeVisible()
})
