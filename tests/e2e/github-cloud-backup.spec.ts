import { expect, test, type BrowserContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('GitHub confirmed backup, offline queue, retry and second-device restore', async ({ page, context, browser }, testInfo) => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test',
    app_metadata: { provider: 'github', providers: ['github'] }, user_metadata: {}, identities: [], created_at: '2026-10-11T00:00:00.000Z' }
  const accessToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`
  let remote: { revision: number; state: unknown; deleted_at: string | null; updated_at?: string } | null = null
  let allowCommit = true
  const mutations = new Map<string, number>()
  async function mockSupabase(target: BrowserContext) {
    await target.addInitScript(({ accessToken, user }) => {
      localStorage.setItem('sb-lcsyotvievikernvhquj-auth-token', JSON.stringify({
        access_token: accessToken, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600, token_type: 'bearer', user,
      }))
    }, { accessToken, user })
    // Every request to the project is intercepted; this test never reaches Production.
    await target.route('https://lcsyotvievikernvhquj.supabase.co/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
      if (path === '/auth/v1/user') { await route.fulfill({ json: user, headers }); return }
      if (path === '/rest/v1/forge_states') { await route.fulfill({ json: remote ? [remote] : [], headers }); return }
      if (path === '/rest/v1/rpc/delete_forge_data') {
        const body = route.request().postDataJSON()
        if (body.p_expected_revision !== (remote?.revision ?? 0)) {
          await route.fulfill({ json: { status: 'VERSION_CONFLICT', revision: remote?.revision ?? 0 }, headers }); return
        }
        const revision = remote?.deleted_at ? remote.revision : (remote?.revision ?? 0) + 1
        remote = { revision, state: {}, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        mutations.clear()
        await route.fulfill({ json: { status: 'DELETED', revision }, headers }); return
      }
      if (path === '/rest/v1/rpc/commit_forge_state') {
        if (!allowCommit) { await route.abort(); return }
        const body = route.request().postDataJSON()
        const prior = mutations.get(body.p_mutation_id)
        if (prior) { await route.fulfill({ json: { status: 'COMMITTED', revision: prior }, headers }); return }
        if (body.p_expected_revision !== (remote?.revision ?? 0)) {
          await route.fulfill({ json: { status: 'VERSION_CONFLICT', revision: remote?.revision ?? 0 }, headers }); return
        }
        if (remote?.deleted_at && !body.p_revive_deleted) {
          await route.fulfill({ json: { status: 'DATA_DELETED', revision: remote.revision }, headers }); return
        }
        remote = { revision: (remote?.revision ?? 0) + 1, state: body.p_state, deleted_at: null, updated_at: new Date().toISOString() }
        mutations.set(body.p_mutation_id, remote.revision)
        await route.fulfill({ json: { status: 'COMMITTED', revision: remote.revision }, headers }); return
      }
      await route.abort()
    })
  }
  await mockSupabase(context)
  await page.goto('/')
  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  await expect(page.getByText('已使用 GitHub 登入。')).toBeVisible()
  await page.getByRole('button', { name: '啟用 GitHub 雲端備份' }).click()
  await expect(page.getByRole('dialog', { name: '確認雲端備份' })).toContainText('將上傳點數')
  expect(remote).toBeNull()
  await page.getByRole('button', { name: '上傳並啟用備份' }).click()
  await expect(page.getByText('目前紀錄已備份到雲端。')).toBeVisible()
  await context.setOffline(true)
  for (const rank of ['4', '7', '6']) await page.locator(`[data-rank-key="${rank}"]`).click()
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByText('待備份 3 筆操作')).toBeVisible()
  await page.getByRole('button', { name: '登出 GitHub' }).click()
  await expect(page.getByText('仍有待送紀錄或正在同步，請先完成備份；尚未登出。')).toBeVisible()
  allowCommit = false
  await context.setOffline(false)
  await page.reload()
  await expect(page.getByText('待備份 3 筆操作')).toBeVisible()
  allowCommit = true
  await page.getByRole('button', { name: '立即重試備份' }).click()
  await expect(page.getByText('目前紀錄已備份到雲端。')).toBeVisible()
  expect(mutations.size).toBe(4)
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await page.screenshot({ path: testInfo.outputPath('github-cloud-backed-up.png'), fullPage: true })

  const other = await browser.newContext()
  try {
    await mockSupabase(other)
    const restored = await other.newPage()
    await restored.goto('http://127.0.0.1:4173/')
    await expect(restored.getByText('已使用 GitHub 登入。')).toBeVisible()
    await restored.getByRole('button', { name: '啟用 GitHub 雲端備份' }).click()
    await expect(restored.getByRole('dialog', { name: '確認雲端備份' })).toContainText('將下載')
    await restored.getByRole('button', { name: '下載並啟用備份' }).click()
    await expect(restored.getByTestId('current-score')).toHaveText('17/21')
    await expect(restored.getByTestId('remaining-total')).toHaveText('剩 49')
    expect(mutations.size).toBe(4)

    const changed = JSON.parse(JSON.stringify(remote!.state))
    changed.rounds[0].draws.push('2')
    remote = { revision: 5, state: changed, deleted_at: null, updated_at: new Date().toISOString() }
    await page.locator('[data-rank-key="3"]').click()
    await expect(page.getByText(/版本衝突：已停止/)).toBeVisible()
    await page.getByRole('button', { name: '比較兩端版本' }).click()
    await expect(page.getByRole('button', { name: '保留本機版本', exact: true })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('github-cloud-conflict.png'), fullPage: true })
    const backupDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: '匯出兩端與待送備份' }).click()
    const downloaded = await backupDownload
    const downloadPath = await downloaded.path()
    expect(downloadPath).not.toBeNull()
    const archive = JSON.parse(await readFile(downloadPath!, 'utf8'))
    expect(archive.localEnvelope.pendingMutationBatches).toHaveLength(1)
    expect(archive.cloud.state.rounds[0].draws).toEqual(['4', '7', '6', '2'])
    await page.getByRole('button', { name: '保留本機版本', exact: true }).click()
    await page.getByRole('button', { name: '確認保留本機', exact: true }).click()
    await expect(page.getByText('目前紀錄已備份到雲端。')).toBeVisible()
    await expect(page.getByTestId('current-score')).toHaveText('20/21')
    expect(remote!.revision).toBe(6)
    expect(mutations.size).toBe(5)

    const cloudChosen = JSON.parse(JSON.stringify(remote!.state))
    cloudChosen.rounds[0].draws = ['4', '7', '2']
    remote = { revision: 7, state: cloudChosen, deleted_at: null, updated_at: new Date().toISOString() }
    await page.locator('[data-rank-key="6"]').click()
    await expect(page.getByText(/版本衝突：已停止/)).toBeVisible()
    await page.getByRole('button', { name: '比較兩端版本' }).click()
    const secondBackup = page.waitForEvent('download')
    await page.getByRole('button', { name: '匯出兩端與待送備份' }).click()
    await secondBackup
    await page.getByRole('button', { name: '保留雲端版本', exact: true }).click()
    await page.getByRole('button', { name: '確認保留雲端', exact: true }).click()
    await expect(page.getByTestId('current-score')).toHaveText('13/21')
    await expect(page.getByText('目前紀錄已備份到雲端。')).toBeVisible()

    await page.getByRole('button', { name: '刪除雲端與此裝置紀錄', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '刪除雲端與此裝置紀錄？' })).toContainText('版本與刪除時間墓碑')
    await page.getByRole('button', { name: '確認刪除雲端與本機', exact: true }).click()
    await expect(page.getByText('尚未開始記錄')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('github-cloud-deleted.png'), fullPage: true })
    expect(remote!.revision).toBe(8)
    expect(remote!.deleted_at).not.toBeNull()
    await restored.locator('[data-rank-key="2"]').click()
    await expect(restored.getByText(/版本衝突：已停止/)).toBeVisible()
    expect(remote!.state).toEqual({})
    expect(remote!.revision).toBe(8)

    await page.getByRole('button', { name: '啟用 GitHub 雲端備份' }).click()
    await expect(page.getByRole('button', { name: '開始新的雲端紀錄', exact: true })).toBeVisible()
    const restartBackup = page.waitForEvent('download')
    await page.getByRole('button', { name: '匯出兩端與待送備份' }).click()
    await restartBackup
    await page.getByRole('button', { name: '開始新的雲端紀錄', exact: true }).click()
    await page.getByRole('button', { name: '確認開始新紀錄', exact: true }).click()
    await expect(page.getByTestId('remaining-total')).toHaveText('剩 52')
    await expect(page.getByText('目前紀錄已備份到雲端。')).toBeVisible()
    expect(remote!.revision).toBe(9)
    expect(remote!.deleted_at).toBeNull()
  } finally { await other.close() }
})
