import { expect, test } from '@playwright/test'

test('桌面結果欄分隔線貫穿整列，手機維持單欄且不水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  const desktopLayout = await page.evaluate(() => {
    const columns = document.querySelector<HTMLElement>('.forge-app__columns')
    const results = document.querySelector<HTMLElement>('.forge-app__results')
    if (!columns || !results) throw new Error('找不到兩欄布局元素')

    return {
      columnsHeight: columns.getBoundingClientRect().height,
      resultsHeight: results.getBoundingClientRect().height,
      columnCount: getComputedStyle(columns).gridTemplateColumns.trim().split(/\s+/).length,
      borderLeftWidth: getComputedStyle(results).borderLeftWidth,
    }
  })

  expect(desktopLayout.columnCount).toBe(2)
  expect(Math.abs(desktopLayout.resultsHeight - desktopLayout.columnsHeight)).toBeLessThanOrEqual(1)
  expect(desktopLayout.borderLeftWidth).toBe('1px')

  await page.setViewportSize({ width: 375, height: 812 })

  const mobileLayout = await page.evaluate(() => {
    const columns = document.querySelector<HTMLElement>('.forge-app__columns')
    if (!columns) throw new Error('找不到欄位布局元素')

    return {
      columnCount: getComputedStyle(columns).gridTemplateColumns.trim().split(/\s+/).length,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  })

  expect(mobileLayout.columnCount).toBe(1)
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth)
})
