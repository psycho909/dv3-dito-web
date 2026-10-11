import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'

const out = 'docs/verification/D1/hosted'
const key = 'dito-forge:local:v1'
const tiers = ['PERFECT', 'GREAT', 'GOOD', 'NORMAL', 'BURST']
const initialExpectedCounts = ['3/49', '8/49', '4/49', '0/49', '34/49']
const initialExpectedPercentages = ['6.12%', '16.33%', '8.16%', '0.00%', '69.39%']
const newRoundExpectedCounts = ['0/49', '0/49', '0/49', '49/49', '0/49']
const newRoundExpectedPercentages = ['0.00%', '0.00%', '0.00%', '100.00%', '0.00%']
test.use({ baseURL: 'https://dv3-dito-web.vercel.app' })
const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>
}
const configuredHeaders = Object.fromEntries((config.headers ?? []).flatMap((entry) =>
  (entry.headers ?? []).filter((header) => header.key && header.value)
    .map((header) => [header.key!.toLowerCase(), header.value!])))
const csp = configuredHeaders['content-security-policy']
if (!csp) throw new Error('vercel.json does not configure Content-Security-Policy')
for (const required of ['x-content-type-options', 'referrer-policy']) {
  if (!configuredHeaders[required]) throw new Error(`vercel.json does not configure ${required}`)
}

async function currentRaw(page: Page) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key)
}

async function captureBrowserEvidence(
  page: Page,
  label: string,
  expectedCounts: string[] = initialExpectedCounts,
  expectedPercentages: string[] = initialExpectedPercentages,
) {
  const evidence = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll<HTMLElement>('.probability__row')]
    const requestedFont = '16px "Dito Forge Digits"'
    const loadedFaces = await document.fonts.load(requestedFont)
    const loadedFont = loadedFaces.some((face) =>
      face.family.replaceAll('"', '').replaceAll("'", '') === 'Dito Forge Digits' && face.status === 'loaded')
    return {
      readyState: document.readyState,
      loadedFont,
      barWidths: rows.map((row) => {
        const bar = row.querySelector<HTMLElement>('.probability__fill')
        const countText = row.querySelector('.probability__condition')?.textContent ?? ''
        return {
          tier: row.dataset.tier,
          count: countText.match(/\d+\s*\/\s*49/)?.[0]?.replaceAll(/\s+/g, ''),
          percentage: row.querySelector<HTMLElement>('[data-tier-probability]')?.textContent,
          inlineWidth: bar?.style.width,
          renderedWidth: bar?.getBoundingClientRect().width,
          cssWidth: bar ? getComputedStyle(bar).width : null,
        }
      }),
    }
  })
  expect(evidence.loadedFont).toBe(true)
  expect(evidence.barWidths).toHaveLength(5)
  expect(evidence.barWidths.map((bar) => bar.count)).toEqual(expectedCounts)
  expect(evidence.barWidths.map((bar) => bar.percentage)).toEqual(expectedPercentages)
  console.log('D1 inline bar widths: ' + JSON.stringify(evidence.barWidths.map(({ tier, inlineWidth, renderedWidth }) => ({ tier, inlineWidth, renderedWidth }))))
  for (const [index, bar] of evidence.barWidths.entries()) {
    expect(bar.inlineWidth).toMatch(/^\d+(?:\.\d+)?%$/)
    const expectedPercent = Number(expectedCounts[index].split('/')[0]) / 49 * 100
    expect(Number.parseFloat(bar.inlineWidth!)).toBeCloseTo(expectedPercent, 4)
    if (expectedPercent === 0) expect(bar.renderedWidth).toBe(0)
    else expect(bar.renderedWidth).toBeGreaterThan(0)
  }
  await page.screenshot({ path: `${out}/${label}-4-7-6.png`, fullPage: true })
  return evidence
}

test('D1 hosted production with actual platform headers', async ({ page }, testInfo) => {
  await mkdir(out, { recursive: true })
  const violations: unknown[] = []
  const pageErrors: string[] = []
  await page.addInitScript(() => {
    const target = window as typeof window & { __d1Violations?: unknown[] }
    target.__d1Violations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      target.__d1Violations?.push({
        effectiveDirective: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      })
    })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const documentResponse = await page.goto('/')
  const responseHeaders = await documentResponse!.allHeaders()
  for (const [name, value] of Object.entries(configuredHeaders)) expect(responseHeaders[name]).toBe(value)
  await expect(page.getByRole('button', { name: '確認從 52 顆開始記錄' })).toBeVisible()

  await page.getByRole('button', { name: '確認從 52 顆開始記錄' }).click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 52')
  await page.locator('[data-rank-key="4"]').click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 51')
  await page.locator('[data-rank-key="7"]').click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 50')
  await page.locator('[data-rank-key="6"]').click()
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  const rankStates = await Promise.all(['4', '7', '6'].map(async (rank) => ({
    rank,
    text: await page.locator(`[data-rank-key="${rank}"]`).innerText(),
  })))
  const tierStates = await Promise.all(tiers.map(async (tier) => {
    const row = page.locator(`[data-tier="${tier}"]`).filter({ has: page.locator('[data-tier-probability]') })
    const conditionText = await row.locator('.probability__condition').innerText()
    return {
      tier,
      conditionText,
      count: conditionText.match(/\d+\s*\/\s*49/)?.[0]?.replaceAll(/\s+/g, ''),
      percentage: await row.locator(`[data-tier-probability="${tier}"]`).innerText(),
    }
  }))
  console.log('D1 actual DOM count text: ' + JSON.stringify(tierStates.map(({ tier, conditionText, count }) => ({ tier, conditionText, count }))))
  expect(tierStates.map((row) => row.count)).toEqual(initialExpectedCounts)
  expect(tierStates.map((row) => row.percentage)).toEqual(initialExpectedPercentages)
  const beforeUndo = await captureBrowserEvidence(page, `${testInfo.project.name}-initial`)

  await page.getByRole('button', { name: '撤銷輸入' }).click()
  await expect(page.getByTestId('current-score')).toHaveText('11/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 50')
  await expect(page.locator('[data-rank-key="6"]')).toContainText('剩 4')
  await page.locator('[data-rank-key="6"]').click()
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')

  await page.getByRole('button', { name: '完成本局', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '完成本局', exact: true }).click()
  await expect(page.locator('.round-finished')).toContainText('49')
  await page.locator('[data-management] summary').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 JSON 備份', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.json$/)
  const stream = await download.createReadStream()
  if (!stream) throw new Error('backup download missing')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const backup = Buffer.concat(chunks).toString('utf8')
  const backupObject = JSON.parse(backup)
  const backupName = download.suggestedFilename()
  await download.saveAs(`${out}/${testInfo.project.name}-${backupName}`)
  const savedSession = await currentRaw(page)
  expect(JSON.parse(savedSession ?? 'null').session.rounds.at(-1).status).toBe('FINISHED')
  await page.getByRole('button', { name: '開始新局' }).click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  const nextCounts = await Promise.all(['4', '7', '6'].map(async (rank) =>
    (await page.locator(`[data-rank-key="${rank}"]`).innerText()).match(/剩 3/)?.[0]))
  expect(nextCounts).toEqual(['剩 3', '剩 3', '剩 3'])

  const newRoundProbabilities = await page.locator('[data-tier-probability]').allTextContents()
  expect(newRoundProbabilities).toHaveLength(5)
  expect(newRoundProbabilities).toEqual(newRoundExpectedPercentages)
  await page.getByRole('button', { name: '只清除此裝置資料', exact: true }).click()
  await page.locator('#data-management-confirm').getByRole('button', { name: '確認清除此裝置資料', exact: true }).click()
  expect(await currentRaw(page)).toBeNull()
  await expect(page.getByRole('button', { name: '確認從 52 顆開始記錄' })).toBeVisible()
  await page.getByLabel('選擇 JSON 備份', { exact: true }).setInputFiles({
    name: backupName,
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  })
  await expect(page.locator('[data-import-preview]')).toContainText('49')
  expect(await currentRaw(page)).toBeNull()
  await page.getByRole('button', { name: '套用匯入備份', exact: true }).click()
  await page.locator('#data-management-confirm').getByRole('button', { name: '確認覆蓋本機紀錄', exact: true }).click()
  violations.push(...await page.evaluate(() => (window as typeof window & { __d1Violations?: unknown[] }).__d1Violations ?? []))
  await page.reload()
  expect(JSON.parse(await currentRaw(page) ?? 'null').session).toEqual(backupObject)
  await expect(page.getByTestId('current-score')).toHaveText('17/21')
  await expect(page.locator('.round-finished')).toContainText('49')
  await page.getByRole('button', { name: '開始新局' }).click()
  await expect(page.getByTestId('remaining-total')).toHaveText('剩 49')
  await expect(page.getByTestId('current-score')).toHaveText('0/21')
  expect(await page.locator('[data-tier-probability]').allTextContents()).toEqual(newRoundProbabilities)
  const finalEvidence = await captureBrowserEvidence(
    page,
    `${testInfo.project.name}-restored`,
    newRoundExpectedCounts,
    newRoundExpectedPercentages,
  )

  violations.push(...await page.evaluate(() => (window as typeof window & { __d1Violations?: unknown[] }).__d1Violations ?? []))
  expect(violations).toEqual([])
  expect(pageErrors).toEqual([])
  const report = {
    executedBy: 'main-orchestrator: hosted production verification',
    project: testInfo.project.name,
    viewport: page.viewportSize(),
    outcome: 'passed',
    documentResponseHeaders: responseHeaders,
    headerMode: 'Actual platform document response headers; no response routing or injection.',
    deployment: {
      targetProject: 'psycho909s-projects/dv3-dito-web',
      targetProjectUrl: 'https://vercel.com/psycho909s-projects/dv3-dito-web',
      hostedDeployment: 'Production READY: 08146000ad7440bb9940cbad7056f7844ea3519a',
    },
    workflow: {
      startCount: 52,
      drawSequence: ['4', '7', '6'],
      score: '17/21',
      remainingByStep: [52, 51, 50, 49],
      rankStates,
      tierStates,
      undo6ThenRedraw: 'passed; restored 17/21 and 49 remaining',
      finishThenNewRound: {
        score: '0/21', remaining: 49, matchingRanks: nextCounts,
        tierCounts: newRoundExpectedCounts, tierProbabilities: newRoundProbabilities,
      },
      backup: { actualDownload: true, downloadFilename: backupName, clearSucceeded: true, selectedViaFileInput: true, previewedBeforeApply: true, restoredAndReloaded: true },
    },
    browserChecks: { initial: beforeUndo, afterRestore: finalEvidence, securityPolicyViolations: violations, pageErrors },
    limitations: [
      'This browser test checks document headers; asset HTTP checks are captured separately.',
      'Chromium desktop and 375px emulation do not replace physical mobile testing.',
      'Artifact filename/layout checks do not guarantee detection of arbitrary secret strings.',
    ],
  }
  await writeFile(`${out}/${testInfo.project.name}-report.json`, `${JSON.stringify(report, null, 2)}\n`)
})
