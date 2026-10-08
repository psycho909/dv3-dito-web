import { expect, test, type Page } from '@playwright/test'

async function beginRecording(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
}

async function record(page: Page, rank: string) {
  await page.locator(`[data-rank-key="${rank}"]`).click()
}

async function recordExample(page: Page) {
  await beginRecording(page)
  for (const rank of ['4', '7', '6']) await record(page, rank)
}

async function confirmFinish(page: Page) {
  await page.getByRole('button', { name: '完成本局' }).click()
}

async function captureStates(page: Page, testName: string, projectName: string) {
  const path = `/tmp/dv3-ticket03-qa/screenshots/${projectName}-${testName}.png`
  await page.screenshot({ path, fullPage: true })
}

test('撤銷 6 還原牌池及分布；連續撤銷至空手牌後不可再撤銷', async ({ page }, testInfo) => {
  await recordExample(page)

  await page.getByRole('button', { name: '撤銷輸入' }).click()
  await expect(page.getByTestId('round-announcement')).toHaveText('已撤銷：6，牌池已還原。')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7'])
  await expect(page.getByTestId('current-score')).toHaveText('11/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 50')
  await expect(page.locator('[data-rank-key="6"]')).toContainText('剩 4')

  await captureStates(page, 'undo', testInfo.project.name)
  for (const expectedHand of [['4'], []]) {
    await page.getByRole('button', { name: '撤銷輸入' }).click()
    await expect(page.locator('.summary__chips .stone-chip')).toHaveText(expectedHand)
  }
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 52')
  await expect(page.getByRole('button', { name: '撤銷輸入' })).toBeDisabled()
  await expect(page.locator('[data-rank-key="4"]')).toContainText('剩 4')
  await expect(page.locator('[data-rank-key="7"]')).toContainText('剩 4')
  await expect(page.locator('[data-rank-key="6"]')).toContainText('剩 4')
})

test('完成確認可取消及 Escape；焦點可循環且背景被 inert 阻擋', async ({ page }, testInfo) => {
  await recordExample(page)
  const finish = page.getByRole('button', { name: '完成本局' })
  await finish.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(/完成本局無法撤銷/)
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused()
  await captureStates(page, 'confirm-open', testInfo.project.name)

  const confirmButton = dialog.getByRole('button', { name: '完成本局' })
  const cancelButton = dialog.getByRole('button', { name: '取消' })
  await page.keyboard.press('Shift+Tab')
  await expect(confirmButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancelButton).toBeFocused()

  const firstRankKey = page.locator('[data-rank-key="A"]')
  await firstRankKey.focus()
  await expect(cancelButton).toBeFocused()
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(finish).toBeFocused()
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await expect(finish).toBeEnabled()

  await confirmFinish(page)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(finish).toBeFocused()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
})

test('確認完成鎖住本局且保留手牌與牌池', async ({ page }, testInfo) => {
  await recordExample(page)
  await confirmFinish(page)
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('本局已完成，手牌與最終分數已保留。')).toBeVisible()
  await expect(page.locator('.round-finished')).toContainText('牌池保留在剩 49 顆')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByTestId('remaining-total')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '撤銷輸入' })).toHaveCount(0)
  await expect(page.locator('[data-rank-key="4"]')).toBeDisabled()
  const guardedActions = await page.evaluate(() => {
    const app = document.querySelector('#app') as (HTMLElement & { __vue_app__?: { config: { globalProperties: Record<string, unknown> } } }) | null
    const pinia = app?.__vue_app__?.config.globalProperties.$pinia as { _s?: Map<string, Record<string, (...args: never[]) => unknown>> } | undefined
    const store = pinia?._s?.get('forge')
    if (!store) return null
    return {
      recordDraw: store.recordDraw('2' as never),
      undoDraw: store.undoDraw(),
    }
  })
  expect(guardedActions).toEqual({ recordDraw: false, undoDraw: null })
  await expect(page.locator('.summary__chips .stone-chip')).toHaveText(['4', '7', '6'])
  await expect(page.locator('.round-finished')).toContainText('牌池保留在剩 49 顆')
  await captureStates(page, 'finished', testInfo.project.name)
})

test('開始新局以零手牌承接剩 49；本局抽牌可撤銷且不回到上一局', async ({ page }, testInfo) => {
  await recordExample(page)
  await confirmFinish(page)
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('button', { name: '開始新局' }).focus()
  await page.keyboard.press('Enter')

  await expect(page.locator('.summary__chips .stone-chip')).toHaveCount(0)
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  for (const rank of ['4', '7', '6']) await expect(page.locator(`[data-rank-key="${rank}"]`)).toContainText('剩 3')
  await expect(page.getByRole('button', { name: '撤銷輸入' })).toBeDisabled()
  await expect(page.locator('[data-rank-key="A"]')).toBeFocused()
  await captureStates(page, 'new-round', testInfo.project.name)

  await record(page, '6')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 48')
  await page.getByRole('button', { name: '撤銷輸入' }).click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await expect(page.locator('.summary__chips .stone-chip')).toHaveCount(0)
  await expect(page.locator('[data-rank-key="6"]')).toContainText('剩 3')
})

test('空手牌允許完成及開始新局；21 點或爆牌不自動完成', async ({ page }) => {
  await beginRecording(page)
  await expect(page.getByRole('button', { name: '完成本局' })).toBeEnabled()
  await confirmFinish(page)
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('button', { name: '開始新局' }).click()

  for (const rank of ['10', '10', 'A']) await record(page, rank)
  await expect(page.getByTestId('current-score')).toHaveText('21/21')
  await expect(page.getByRole('button', { name: '完成本局' })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤銷輸入' })).toBeEnabled()
  await record(page, '2')
  await expect(page.getByTestId('current-score')).toHaveText('23/21')
  await expect(page.getByRole('button', { name: '完成本局' })).toBeVisible()
})

test('用罄點數跨局仍 disabled，不補滿也不允許超過初始牌數', async ({ page }) => {
  await beginRecording(page)
  for (let copy = 0; copy < 4; copy += 1) await record(page, '4')
  await expect(page.locator('[data-rank-key="4"]')).toBeDisabled()
  await confirmFinish(page)
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('button', { name: '開始新局' }).click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 48')
  await expect(page.locator('[data-rank-key="4"]')).toBeDisabled()
  await expect(page.locator('body')).not.toContainText(/剩 52/)

  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
    const key = page.locator(`[data-rank-key="${rank}"]`)
    if (rank === '4') await expect(key).toContainText('剩 0')
  }
})

test('撤銷、本局完成及新局在目標寬度無水平溢出且操作按鈕至少 44px', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
    await page.reload()
    await recordExample(page)
    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll<HTMLButtonElement>('.round-actions__button')].map((button) => {
        const rect = button.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
      scrollbarColor: getComputedStyle(document.documentElement).scrollbarColor,
    }))
    expect(layout.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewportWidth)
    expect(layout.controls.length).toBeGreaterThan(0)
    for (const size of layout.controls) {
      expect(size.width, `action button narrower than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
      expect(size.height, `action button shorter than 44px at ${width}px`).toBeGreaterThanOrEqual(44)
    }
    expect(layout.scrollbarColor).not.toBe('auto')
  }
})
