import { expect, test, type Page } from '@playwright/test'

const key = 'dito-forge:local:v1'

async function begin(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  for (const rank of ['4', '7', '6']) await page.locator(`[data-rank-key="${rank}"]`).click()
}

async function openManagement(page: Page) {
  const details = page.locator('[data-account-details]')
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await details.locator(':scope > summary').click()
  }
}

async function selectBackup(page: Page, raw: string, name = 'forge.json') {
  await page.getByLabel('選擇 JSON 備份', { exact: true }).setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(raw),
  })
}

async function currentRaw(page: Page) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key)
}

test('T19：下載純記牌 JSON、清除此裝置，再預覽匯入還原歷史、牌池及機率', async ({ page }) => {
  await begin(page)
  await page.getByRole('button', { name: '完成本局', exact: true }).click()
  await page.locator('#finish-round').getByRole('button', { name: '完成本局', exact: true }).click()
  const before = JSON.parse(await currentRaw(page) ?? 'null').session
  await openManagement(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 JSON 備份', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.json$/)
  const stream = await download.createReadStream()
  if (!stream) throw new Error('backup download missing')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const backup = Buffer.concat(chunks).toString('utf8')
  expect(JSON.parse(backup)).toEqual(before)
  expect(backup).not.toMatch(/deviceId|cloudAccountId|pendingMutationBatches|access_token|refresh_token/)
  await page.getByRole('button', { name: '開始新局' }).click()
  const probabilities = await page.locator('[data-tier-probability]').allTextContents()
  const beforeClear = await currentRaw(page)
  await page.evaluate(() => localStorage.setItem('other-app:data', 'keep'))
  await page.getByRole('button', { name: '只清除此裝置資料', exact: true }).click()
  const confirm = page.locator('#data-management-confirm')
  await expect(confirm.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await currentRaw(page)).toBe(beforeClear)
  await page.getByRole('button', { name: '只清除此裝置資料', exact: true }).click()
  await confirm.getByRole('button', { name: '確認清除此裝置資料', exact: true }).click()
  expect(await currentRaw(page)).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('other-app:data'))).toBe('keep')
  await expect(page.getByRole('button', { name: '確認從 52 顆開始記錄' })).toBeVisible()
  await expect(page.locator('[data-tier-probability]')).toHaveCount(0)
  await selectBackup(page, backup)
  await expect(page.locator('[data-import-preview]')).toContainText('49')
  expect(await currentRaw(page)).toBeNull()
  await page.getByRole('button', { name: '套用匯入備份', exact: true }).click()
  await expect(confirm.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await confirm.getByRole('button', { name: '確認覆蓋本機紀錄', exact: true }).click()
  await page.reload()
  expect(JSON.parse(await currentRaw(page) ?? 'null').session).toEqual(before)
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.locator('.round-finished')).toContainText('49')
  await page.getByRole('button', { name: '開始新局' }).click()
  for (const rank of ['4', '7', '6']) await expect(page.locator(`[data-rank-key="${rank}"]`)).toContainText('剩 3')
  expect(await page.locator('[data-tier-probability]').allTextContents()).toEqual(probabilities)
  expect(probabilities).toHaveLength(5)
})

test('T15：錯誤格式、未知版本與超抽備份拒絕，保留原始紀錄', async ({ page }) => {
  await begin(page)
  await openManagement(page)
  const original = await currentRaw(page)
  const session = JSON.parse(original ?? 'null').session
  const overdraw = { ...session, rounds: [{ ...session.rounds[0], draws: ['A', 'A', 'A', 'A', 'A'] }] }
  for (const raw of ['{broken', JSON.stringify({ ...session, schemaVersion: 99 }), JSON.stringify(overdraw)]) {
    await selectBackup(page, raw)
    await expect(page.locator('[data-management] [role="alert"]')).toBeVisible()
    await expect(page.getByRole('button', { name: '套用匯入備份', exact: true })).toHaveCount(0)
    expect(await currentRaw(page)).toBe(original)
  }
})

test('手動重置確認遊戲已補滿，保留舊局並建立新空手牌，重載仍有效', async ({ page }) => {
  await begin(page)
  await openManagement(page)
  const original = await currentRaw(page)
  await page.getByRole('button', { name: '重置牌池', exact: true }).click()
  const confirm = page.locator('#data-management-confirm')
  await expect(confirm).toContainText('52')
  await page.keyboard.press('Escape')
  expect(await currentRaw(page)).toBe(original)
  await page.getByRole('button', { name: '重置牌池', exact: true }).click()
  await confirm.getByRole('button', { name: '確認遊戲已補滿並重置', exact: true }).click()
  const session = JSON.parse(await currentRaw(page) ?? 'null').session
  expect(session.cycles[1]).toMatchObject({ reason: 'MANUAL_RESET', previousRemaining: 49 })
  expect(session.rounds[0]).toMatchObject({ status: 'FINISHED', draws: ['4', '7', '6'] })
  expect(session.rounds[1].draws).toEqual([])
  await page.reload()
  await expect(page.locator('.deck-status')).toContainText('52 / 52')
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
})

test('其他分頁在匯入確認期間更新，拒絕覆蓋並聚焦復原入口', async ({ page, context }) => {
  await begin(page)
  await openManagement(page)
  const raw = await currentRaw(page)
  await selectBackup(page, JSON.stringify(JSON.parse(raw ?? 'null').session))
  await page.getByRole('button', { name: '套用匯入備份', exact: true }).click()
  const other = await context.newPage()
  await other.goto('/')
  await other.locator('[data-rank-key="2"]').click()
  const external = await currentRaw(other)
  await page.locator('#data-management-confirm').getByRole('button', { name: '確認覆蓋本機紀錄', exact: true }).click()
  await expect(page.locator('.local-recovery')).toContainText('其他分頁')
  await expect(page.locator('#local-recovery-title')).toBeFocused()
  expect(await currentRaw(page)).toBe(external)
  await other.close()
})

test('清除失敗不清空記憶體，原資料可重新讀取，資料管理在窄螢幕可操作', async ({ page }) => {
  await begin(page)
  await openManagement(page)
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  const original = await currentRaw(page)
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new Error('denied') } })
  await page.getByRole('button', { name: '只清除此裝置資料', exact: true }).click()
  await page.locator('#data-management-confirm').getByRole('button', { name: '確認清除此裝置資料', exact: true }).click()
  await expect(page.locator('.local-recovery')).toBeVisible()
  expect(await currentRaw(page)).toBe(original)
  await page.getByRole('button', { name: '重新讀取本機資料', exact: true }).click()
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
})
