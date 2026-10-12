import { expect, test } from '@playwright/test'

function luminance(color: string): number {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!channels || channels.length !== 3) throw new Error(`無法解析 computed color：${color}`)
  const linear = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

test('實際 BURST、明細、資料錯誤與歷史介面符合視覺無障礙門檻', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await expect(page.locator('h1')).toHaveCount(1)
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  await page.locator('[data-rank-key="10"]').click()
  await page.locator('[data-rank-key="10"]').click()
  await page.locator('[data-rank-key="2"]').click()
  await expect(page.locator('.summary[data-tier="BURST"]')).toBeVisible()
  const burstRisk = page.locator('.risk-strip[data-current-tier="BURST"]')
  await expect(burstRisk).toBeVisible()
  await expect(burstRisk).toContainText('本局已爆牌')
  const burstViewport = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
  }))
  expect(burstViewport.documentWidth, '375px BURST 不得水平溢出').toBeLessThanOrEqual(burstViewport.viewportWidth)

  await page.getByRole('button', { name: '展開逐點數明細' }).click()
  await expect(page.locator('.rank-detail__content')).toBeVisible()
  await page.locator('[data-account-details] > summary').click()
  await page.locator('#backup-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ invalid json'),
  })
  await expect(page.locator('.data-management__error')).toBeVisible()
  await page.getByRole('button', { name: '歷史與修正' }).click()
  await expect(page.getByRole('dialog', { name: '歷史紀錄' })).toBeVisible()
  await page.setViewportSize({ width: 320, height: 812 })

  const audit = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false
        if (node instanceof HTMLDetailsElement && !node.open && !node.querySelector(':scope > summary')?.contains(element)) return false
        if (node instanceof HTMLDialogElement && !node.open) return false
      }
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    const opaqueBackgroundFor = (element: Element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor
        const match = color.match(/^rgba?\((.*)\)$/)
        if (!match) continue
        const values = match[1]!.match(/[\d.]+/g) ?? []
        const alpha = values.length === 4 ? Number(values[3]) : 1
        if (alpha === 1) return color
      }
      return getComputedStyle(document.documentElement).backgroundColor
    }
    const text = [...document.querySelectorAll('*')]
      .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())) && isVisible(element))
      .map((element) => ({
        text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 70),
        foreground: getComputedStyle(element).color,
        background: opaqueBackgroundFor(element),
        fontSize: parseFloat(getComputedStyle(element).fontSize),
      }))
    const controls = [...document.querySelectorAll('button,input,select,textarea,summary,a[href],[role="button"]')]
      .filter(isVisible)
      .map((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('type') || element.tagName).trim().slice(0, 50),
          disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
            ? element.disabled
            : element.getAttribute('aria-disabled') === 'true',
          width: rect.width,
          height: rect.height,
          borderWidth: parseFloat(style.borderTopWidth),
          borderColor: style.borderTopColor,
          background: opaqueBackgroundFor(element),
        }
      })
    const summary = document.querySelector('.summary[data-tier="BURST"]')
    const summaryStyle = summary ? getComputedStyle(summary) : null
    const summaryScore = summary?.querySelector('.summary__score > span:first-child')
    const summaryTier = summary?.querySelector('.summary__tier')
    const summaryTierScore = summary?.querySelector('.summary__tier-score')
    const risk = document.querySelector('.risk-strip[data-current-tier="BURST"]')
    const riskStyle = risk ? getComputedStyle(risk) : null
    const riskText = risk?.querySelector('.risk-strip__unavailable')
    const riskTextStyle = riskText ? getComputedStyle(riskText) : null
    const burstBar = document.querySelector('[data-tier="BURST"] .probability__fill')
    const burstTrack = document.querySelector('[data-tier="BURST"] .probability__track')
    const barStyle = burstBar ? getComputedStyle(burstBar) : null
    const trackStyle = burstTrack ? getComputedStyle(burstTrack) : null
    const fileButtonStyle = getComputedStyle(document.querySelector('#backup-file')!, '::file-selector-button')
    return {
      text,
      controls,
      summary: summaryStyle ? {
        border: summaryStyle.borderLeftColor,
        background: opaqueBackgroundFor(summary!),
        score: summaryScore ? getComputedStyle(summaryScore).color : null,
        tier: summaryTier ? {
          text: getComputedStyle(summaryTier).color,
          background: opaqueBackgroundFor(summaryTier),
        } : null,
        tierScore: summaryTierScore ? getComputedStyle(summaryTierScore).color : null,
      } : null,
      risk: riskStyle && riskTextStyle ? {
        border: riskStyle.borderLeftColor,
        background: opaqueBackgroundFor(risk!),
        text: riskTextStyle.color,
      } : null,
      burstBar: barStyle && trackStyle ? { fill: barStyle.backgroundColor, track: trackStyle.backgroundColor } : null,
      fileButton: {
        width: Math.max(parseFloat(fileButtonStyle.width) || 0, parseFloat(fileButtonStyle.minWidth) || 0),
        height: Math.max(parseFloat(fileButtonStyle.height) || 0, parseFloat(fileButtonStyle.minHeight) || 0),
        border: fileButtonStyle.borderTopColor,
        background: fileButtonStyle.backgroundColor,
      },
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  })

  const textFailures = audit.text.filter(({ foreground, background, fontSize }) =>
    fontSize < 13 || contrast(foreground, background) < 4.5)
  expect(textFailures, '可見文字 leaf 需至少 13px 且 computed contrast ≥4.5:1').toEqual([])

  const targetFailures = audit.controls.filter(({ width, height }) => width < 44 || height < 44)
  expect(targetFailures, '包含 disabled 在內的每個可見互動控制需至少 44×44 CSS px').toEqual([])

  const edgeFailures = audit.controls.filter(({ disabled, borderWidth, borderColor, background }) =>
    !disabled && borderWidth > 0 && contrast(borderColor, background) < 3)
  expect(edgeFailures, '啟用控制項可見邊界需 computed contrast ≥3:1').toEqual([])

  expect(audit.summary, '需檢查實際 BURST 分數板').not.toBeNull()
  expect(contrast(audit.summary!.border, audit.summary!.background), 'BURST 分數板熱度邊框需 ≥3:1').toBeGreaterThanOrEqual(3)
  expect(audit.summary!.score).not.toBeNull()
  expect(contrast(audit.summary!.score!, audit.summary!.background), 'BURST 分數需 ≥4.5:1').toBeGreaterThanOrEqual(4.5)
  expect(audit.summary!.tier).not.toBeNull()
  expect(contrast(audit.summary!.tier!.text, audit.summary!.tier!.background), 'BURST 標籤需 ≥4.5:1').toBeGreaterThanOrEqual(4.5)
  expect(contrast(audit.summary!.tierScore!, audit.summary!.background), 'BURST 等級得分需 ≥4.5:1').toBeGreaterThanOrEqual(4.5)
  expect(audit.risk, '需檢查 BURST 風險條').not.toBeNull()
  expect(contrast(audit.risk!.text, audit.risk!.background), 'BURST 風險文字需 ≥4.5:1').toBeGreaterThanOrEqual(4.5)
  expect(audit.burstBar, '需檢查 BURST 機率條實際 fill 與 track').not.toBeNull()
  expect(contrast(audit.burstBar!.fill, audit.burstBar!.track), 'BURST fill 對 track 需 ≥3:1').toBeGreaterThanOrEqual(3)
  expect(audit.fileButton.width).toBeGreaterThanOrEqual(44)
  expect(audit.fileButton.height).toBeGreaterThanOrEqual(44)
  expect(contrast(audit.fileButton.border, audit.fileButton.background), 'file-selector 邊界需 ≥3:1').toBeGreaterThanOrEqual(3)
  expect(audit.documentWidth, '320px 窄螢幕不得水平溢出').toBeLessThanOrEqual(audit.viewportWidth)
})


test('完成爆牌局後，下局預估風險條不沿用本局爆牌樣式 [burst-finish-forecast]', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  await page.locator('[data-rank-key="10"]').click()
  await page.locator('[data-rank-key="10"]').click()
  await page.locator('[data-rank-key="2"]').click()

  const risk = page.locator('.risk-strip[data-current-tier="BURST"]')
  await expect(risk).toHaveAttribute('data-risk-mode', 'terminal')
  await expect(risk).toHaveCSS('background-color', 'rgb(222, 102, 112)')
  await page.getByRole('button', { name: '完成本局' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局' }).click()

  const forecast = page.locator('.risk-strip[data-current-tier="BURST"][data-risk-mode="next-round"]')
  await expect(forecast).toBeVisible()
  await expect(forecast).toContainText('下局預估爆牌')
  await expect(forecast).toHaveCSS('background-color', 'rgb(29, 34, 42)')
  await expect(forecast).toHaveCSS('color', 'rgb(238, 240, 242)')
})

test('點數鍵 hover 與按下時的庫存文字仍達 4.5:1', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  const key = page.locator('[data-rank-key="4"]')
  await key.hover()
  for (const pressed of [false, true]) {
    if (pressed) await page.mouse.down()
    const colors = await key.evaluate((element) => ({
      text: getComputedStyle(element.querySelector('.keypad__remaining')!).color,
      background: getComputedStyle(element).backgroundColor,
    }))
    expect(contrast(colors.text, colors.background), pressed ? '按下' : 'hover').toBeGreaterThanOrEqual(4.5)
    if (pressed) await page.mouse.up()
  }
})

test('第一顆石頭使用 120ms 動態且 reduced-motion 完全停用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  const drawMotion = () => page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>('[data-rank-key="4"]')!
    button.click()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const chip = document.querySelector('.stone-chip:last-child')!
    return chip.getAnimations().map((animation) => animation.effect?.getTiming().duration)
  })
  expect(await drawMotion(), '第一顆亦需有單一不超過 150ms 的石頭動態').toEqual([120])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await drawMotion(), 'reduced-motion 不得啟動任何石頭動畫').toEqual([])
})
