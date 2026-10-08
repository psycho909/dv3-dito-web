import { expect, test, type Page } from '@playwright/test'

async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
}

async function draw(page: Page, rank: string) {
  await page.locator(`[data-rank-key="${rank}"]`).click()
}

test('4、7、6 顯示停手比較，撤銷後同步回到再抽建議；重新載入可恢復', async ({ page }) => {
  await start(page)
  await expect(page.getByRole('region', { name: '本局建議' })).toContainText('建議再抽')
  await draw(page, '4')
  await draw(page, '7')

  const hint = page.getByRole('region', { name: '本局建議' })
  const keypad = page.getByRole('region', { name: '記錄遊戲剛抽到的石頭' })
  const beforeStopTop = await keypad.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  await draw(page, '6')
  await expect(hint).toContainText('建議停手')
  await expect(hint).toContainText('停在 17，距 21 差 4')
  await expect(hint).toContainText('再抽平均差 15.76')
  await expect(hint).toContainText('以最終點數接近 21 為目標，不代表獎勵最高')
  const afterStopTop = await keypad.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  expect(Math.abs(afterStopTop - beforeStopTop)).toBeLessThanOrEqual(1)
  await expect(hint.locator('button')).toHaveCount(0)

  await page.getByRole('button', { name: '撤銷輸入' }).click()
  await expect(hint).toContainText('建議再抽')
  await page.reload()
  await expect(page.getByRole('region', { name: '本局建議' })).toContainText('建議再抽')
  await expect(page.getByTestId('current-score')).toHaveText('11/21')
})

test('鍵盤可操作建議流程，推定週期有標記且提示更新不移動點數鍵', async ({ page }) => {
  await page.goto('/')
  const confirm = page.getByRole('button', { name: '確認從 52 顆開始記錄' })
  await confirm.focus()
  await page.keyboard.press('Enter')
  const firstKey = page.locator('[data-rank-key="A"]')
  await expect(firstKey).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: '本局建議' })).toContainText('建議再抽')

  await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
  await page.reload()
  await start(page)
  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9']) {
    for (let copy = 0; copy < 4; copy += 1) await draw(page, rank)
  }
  await draw(page, '10')
  await draw(page, '10')
  await page.getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
  await expect(page.getByRole('region', { name: '本局建議' })).toHaveCount(0)
  await page.getByRole('button', { name: '開始新局' }).click()
  await page.locator('[data-cycle-observation="LATER"]').click()
  const hint = page.getByRole('region', { name: '本局建議' })
  await expect(hint).toContainText('推定牌池')
  await draw(page, '4')
  await draw(page, '7')
  const keypad = page.getByRole('region', { name: '記錄遊戲剛抽到的石頭' })
  const beforeStopTop = await keypad.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  await draw(page, '6')
  await expect(hint).toContainText('建議停手')
  const afterStopTop = await keypad.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  expect(Math.abs(afterStopTop - beforeStopTop)).toBeLessThanOrEqual(1)
})

test('支援窄螢幕至桌面、reduced motion；UNSYNCED 明確不提供操作建議', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await start(page)
    await draw(page, '4')
    await draw(page, '7')
    await expect(page.getByRole('region', { name: '本局建議' })).toContainText('建議再抽')
    const keypad = page.getByRole('region', { name: '記錄遊戲剛抽到的石頭' })
    const beforeStopTop = await keypad.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
    await draw(page, '6')
    await expect(page.getByRole('region', { name: '本局建議' })).toContainText('建議停手')
    const afterStopTop = await keypad.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
    expect(Math.abs(afterStopTop - beforeStopTop), `keypad moved at ${width}px`).toBeLessThanOrEqual(1)
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      hint: document.querySelector('.recommendation-hint')?.getBoundingClientRect().height ?? 0,
      goalFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.recommendation-hint__goal')!).fontSize),
      numberStyle: getComputedStyle(document.querySelector('.recommendation-hint__message')!).fontVariantNumeric,
    }))
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport)
    expect(geometry.hint).toBeGreaterThan(0)
    expect(geometry.goalFontSize).toBeGreaterThanOrEqual(13)
    expect(geometry.numberStyle).toContain('tabular-nums')
    await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
  }

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await start(page)
  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9']) {
    for (let copy = 0; copy < 4; copy += 1) await draw(page, rank)
  }
  await draw(page, '10')
  await draw(page, '10')
  await page.getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('button', { name: '開始新局' }).click()
  await page.locator('[data-cycle-observation="DENIED"]').click()
  const hint = page.getByRole('region', { name: '本局建議' })
  await expect(hint).toContainText('牌池未同步，無法提供建議')
  await expect(hint.locator('button')).toHaveCount(0)
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
})
