import { expect, test, type BrowserContext } from '@playwright/test'

test('GitHub confirmed backup, offline queue, retry and second-device restore', async ({ page, context, browser }, testInfo) => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test',
    app_metadata: { provider: 'github', providers: ['github'] }, user_metadata: {}, identities: [], created_at: '2026-10-11T00:00:00.000Z' }
  const accessToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`
  let remote: { revision: number; state: unknown; deleted_at: null } | null = null
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
      if (path === '/rest/v1/rpc/commit_forge_state') {
        if (!allowCommit) { await route.abort(); return }
        const body = route.request().postDataJSON()
        const prior = mutations.get(body.p_mutation_id)
        if (prior) { await route.fulfill({ json: { status: 'COMMITTED', revision: prior }, headers }); return }
        if (body.p_expected_revision !== (remote?.revision ?? 0)) {
          await route.fulfill({ json: { status: 'VERSION_CONFLICT', revision: remote?.revision ?? 0 }, headers }); return
        }
        remote = { revision: (remote?.revision ?? 0) + 1, state: body.p_state, deleted_at: null }
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
  } finally { await other.close() }
})
