import { expect, test, type Locator, type Page } from '@playwright/test'

const viewports = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
] as const

async function startFresh(page: Page, viewport: (typeof viewports)[number]) {
  await page.setViewportSize(viewport)
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
  await page.reload()
}

async function draw(page: Page, rank: string) {
  await page.locator(`[data-rank-key="${rank}"]`).click()
}

async function assertInsideViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox()
  expect(box, `${label} must have a bounding box`).not.toBeNull()
  if (!box) return

  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport.height)
}

test('三種視窗與三種狀態的完整工作台都留在首屏', async ({ page }) => {
  for (const viewport of viewports) {
    let referenceGeometry: Array<{
      label: string
      x: number
      y: number
      width: number
      height: number
    }> | undefined

    for (const state of ['unstarted', 'active', 'finished'] as const) {
      await startFresh(page, viewport)
      if (state !== 'unstarted') {
        await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
        for (const rank of ['A', '2', '2', '3', '3', '4']) await draw(page, rank)
      }
      if (state === 'finished') {
        await page.getByRole('button', { name: '完成本局' }).click()
        await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()
      }

      const workbench = page.getByTestId('forge-workbench')
      const titleRow = workbench.getByTestId('workbench-title-row')
      const scoreboard = workbench.getByTestId('workbench-scoreboard')
      const risk = workbench.getByTestId('next-draw-risk')
      const keypad = workbench.getByRole('region', { name: '記錄遊戲剛抽到的石頭' })
      const keypadGrid = keypad.locator('.keypad__grid')
      const actions = workbench.getByRole('region', { name: '本局操作' })

      await expect(workbench).toBeVisible()
      await expect(keypad.locator('.keypad__key')).toHaveCount(10)
      for (const [locator, label] of [
        [workbench, 'workbench'],
        [titleRow, 'title row'],
        [scoreboard, 'scoreboard'],
        [risk, 'risk strip'],
        [keypadGrid, 'keypad'],
        [actions, 'action row'],
      ] as const) {
        await assertInsideViewport(page, locator, `${viewport.width}x${viewport.height} ${state} ${label}`)
      }

      const geometryElements = [
        [workbench, 'workbench'],
        [scoreboard, 'scoreboard'],
        [risk, 'risk strip'],
        [keypadGrid, 'keypad'],
        [actions, 'action row'],
      ] as const
      const geometry = await Promise.all(geometryElements.map(async ([locator, label]) => {
        const box = await locator.boundingBox()
        expect(box, `${label} must have a bounding box`).not.toBeNull()
        if (!box) throw new Error(`${label} is missing its bounding box`)
        return { label, x: box.x, y: box.y, width: box.width, height: box.height }
      }))

      if (!referenceGeometry) {
        referenceGeometry = geometry
      } else {
        for (const [index, current] of geometry.entries()) {
          const reference = referenceGeometry[index]
          for (const dimension of ['x', 'y', 'width', 'height'] as const) {
            expect(
              Math.abs(current[dimension] - reference[dimension]),
              `${viewport.width}x${viewport.height} ${state} ${current.label} ${dimension} must stay aligned`,
            ).toBeLessThanOrEqual(1)
          }
        }
      }

      if (state === 'unstarted') {
        const startButton = workbench.getByRole('button', { name: '確認從 52 顆開始記錄' })
        await expect(startButton).toBeVisible()
        await assertInsideViewport(page, startButton, 'start recording button')
        await expect(risk).toContainText('開始記錄後顯示')
        await expect(risk).not.toContainText('%')
        await expect(keypad.locator('.keypad__key:disabled')).toHaveCount(10)
      } else {
        await expect(scoreboard.getByTestId('current-score')).toBeVisible()
        await expect(scoreboard.locator('.summary__chips .stone-chip')).toHaveCount(6)
        await expect(workbench.getByRole('button', { name: /剩餘牌池 46 \/ 52/ })).toBeVisible()
        await assertInsideViewport(page, scoreboard.locator('.summary__chips'), 'drawn stones')
        await assertInsideViewport(page, workbench.getByRole('button', { name: /剩餘牌池 46 \/ 52/ }), 'remaining deck button')
      }

      if (state === 'active') {
        await expect(scoreboard.locator('.summary__recommendation')).toBeVisible()
        await expect(risk).toHaveAttribute('aria-label', /下一顆安全率/)
        await expect(workbench.getByRole('button', { name: '撤銷輸入' })).toBeVisible()
        await expect(workbench.getByRole('button', { name: '完成本局' })).toBeVisible()
      }
      if (state === 'finished') {
        await expect(scoreboard.getByTestId('round-finished-result')).toContainText('得')
        await expect(risk).toHaveAttribute('aria-label', /下局預估爆牌/)
        const forecastBurst = (await page.locator(
          '[aria-label="下一局等級預估"] [data-forecast-tier-probability="BURST"] strong',
        ).innerText()).trim()
        await expect(risk).toContainText(`下局預估爆牌 ${forecastBurst}（依建議操作）`)
        await expect(risk).not.toContainText('安全率')
        await expect(workbench.getByRole('button', { name: '開始新局' })).toBeVisible()
      }

      if (viewport.width === 375) {
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          page: document.documentElement.scrollWidth,
          chipWrap: document.querySelector('.summary__chips')
            ? getComputedStyle(document.querySelector('.summary__chips')!).flexWrap
            : null,
          tierWhiteSpace: document.querySelector('.summary__tier')
            ? getComputedStyle(document.querySelector('.summary__tier')!).whiteSpace
            : document.querySelector('.summary__finished-result')
              ? getComputedStyle(document.querySelector('.summary__finished-result')!).whiteSpace
              : null,
        }))
        expect(dimensions.page, `${state} must not overflow at 375px`).toBeLessThanOrEqual(dimensions.viewport)
        if (state !== 'unstarted') {
          expect(dimensions.chipWrap).toBe('nowrap')
          expect(dimensions.tierWhiteSpace).toBe('nowrap')
        }
      }

      if (viewport.width === 1280 && state !== 'unstarted') {
        const columns = await page.evaluate(() => {
          const workbenchBox = document.querySelector('[data-testid="forge-workbench"]')!.getBoundingClientRect()
          const detailsBox = document.querySelector('[data-testid="forge-app-details"]')!.getBoundingClientRect()
          return { workbenchRight: workbenchBox.right, detailsLeft: detailsBox.left }
        })
        expect(columns.workbenchRight).toBeLessThanOrEqual(columns.detailsLeft)
      }
    }
  }
})

test('熱條呈現三級警示、更新不移動鍵盤，reduced-motion 不播放動態', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startFresh(page, viewports[0])
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()

  const risk = page.getByTestId('next-draw-risk')
  const keypad = page.getByRole('region', { name: '記錄遊戲剛抽到的石頭' })
  const layout = async () => keypad.locator('.keypad__grid').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { y: rect.y, height: rect.height }
  })
  const initialLayout = await layout()
  await expect(risk).toHaveAttribute('data-risk-level', 'normal')
  await expect(risk).toContainText('一般')
  await expect(risk).toContainText('爆牌 0.00%')

  await draw(page, '7')
  await draw(page, '7')
  await expect(risk).toHaveAttribute('data-risk-level', 'caution')
  await expect(risk).toContainText('注意')
  await expect(risk).toContainText('爆牌 48.00%')
  expect(await layout()).toEqual(initialLayout)

  await page.reload()
  await page.evaluate(() => localStorage.removeItem('dito-forge:local:v1'))
  await page.reload()
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  await draw(page, '10')
  await draw(page, '10')
  await expect(risk).toHaveAttribute('data-risk-level', 'high')
  await expect(risk).toContainText('高風險')
  const stripes = await risk.locator('.risk-strip__fill').evaluate((element) =>
    getComputedStyle(element, '::after').backgroundImage,
  )
  expect(stripes).toContain('repeating-linear-gradient')
  expect(await layout()).toEqual(initialLayout)
  const transitionDuration = await risk.locator('.risk-strip__fill').evaluate((element) =>
    getComputedStyle(element).transitionDuration,
  )
  expect(transitionDuration).toBe('0s')
})

test('本局已爆牌或達 21 點時只顯示狀態，保留熱條高度', async ({ page }) => {
  for (const scenario of [
    { draws: ['10', '4', '3', 'A', '2', '6'], label: '本局已爆牌' },
    { draws: ['10', '5', '6'], label: '已達 21 點' },
  ]) {
    await startFresh(page, viewports[0])
    await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
    const risk = page.getByTestId('next-draw-risk')
    const originalHeight = (await risk.boundingBox())!.height

    for (const rank of scenario.draws) await draw(page, rank)

    await expect(risk).toHaveText(scenario.label)
    await expect(risk).toHaveAttribute('data-risk-level', 'terminal')
    await expect(risk).toHaveAttribute('aria-label', scenario.label)
    await expect(risk).not.toContainText(/%|高風險/)
    await expect(risk.locator('.risk-strip__track')).toHaveCount(0)
    expect((await risk.boundingBox())!.height).toBe(originalHeight)
  }
})

test('剩 15 顆以下完成本局後，標示推定 52 顆並對齊下局 BURST 機率', async ({ page }) => {
  await startFresh(page, viewports[0])
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9']) {
    for (let copy = 0; copy < 4; copy += 1) await draw(page, rank)
  }
  await draw(page, '10')
  await draw(page, '10')
  await expect(page.getByRole('button', { name: /剩餘牌池 14 \/ 52/ })).toBeVisible()
  await page.getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()

  const risk = page.getByTestId('next-draw-risk')
  const forecastBurst = (await page.locator(
    '[aria-label="下一局等級預估"] [data-forecast-tier-probability="BURST"] strong',
  ).innerText()).trim()
  await expect(risk).toContainText(`下局預估爆牌 ${forecastBurst}（依建議操作）`)
  await expect(risk).toContainText('推定 52 顆')
  await expect(risk).not.toContainText('安全率')
})
