/* global window, performance */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import { log } from 'node:console'
import { build } from 'vite'
import { chromium } from '@playwright/test'

// Bundle the actual domain entry without altering the product build or exposing a test hook.
const built = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: fileURLToPath(new URL('../../src/domain/recommendation.ts', import.meta.url)),
      name: 'ForgeRecommendation',
      formats: ['iife'],
    },
  },
})
const outputs = Array.isArray(built) ? built : [built]
const chunk = outputs.flatMap((output) => output.output).find((output) => output.type === 'chunk')
assert.ok(chunk, 'The production recommendation module must bundle successfully')

const browser = await chromium.launch()
try {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.setContent('<!doctype html><html lang="zh-Hant"><title>推薦效能驗證</title><body></body></html>')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addScriptTag({ content: chunk.code })
  const results = await page.evaluate(() => {
    const initial = { A: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 16 }
    const cases = [
      { name: 'fresh-52-empty-hand', hand: [], deck: initial },
      { name: 'small-ranks-20-empty-hand', hand: [], deck: { ...initial, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 } },
      { name: 'small-ranks-12-empty-hand', hand: [], deck: { ...initial, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 } },
      { name: '4-7-6-remaining-49', hand: ['4', '7', '6'], deck: { ...initial, 4: 3, 7: 3, 6: 3 } },
    ]
    return cases.map(({ name, hand, deck }) => {
      const samples = []
      let computationLimits = 0
      let result
      // No warm-up is discarded. Every invocation creates a fresh memo.
      for (let trial = 0; trial < 100; trial += 1) {
        const start = performance.now()
        result = window.ForgeRecommendation.recommendWithinRound(hand, deck)
        samples.push(performance.now() - start)
        if (result.reason === 'COMPUTATION_LIMIT') computationLimits += 1
      }
      const sorted = [...samples].sort((a, b) => a - b)
      return {
        name, trials: samples.length, firstMs: samples[0],
        p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
        maxMs: sorted.at(-1), computationLimits, result, samplesMs: samples,
      }
    })
  })
  const evidence = {
    browser: browser.version(), cpuThrottle: 4, viewport: { width: 375, height: 812 },
    method: '100 sequential calls per case, no discarded warm-up, fresh memo each solve; nearest-rank p95. Measures exact domain solve, not total UI latency.',
    results,
  }
  await writeFile('/tmp/dv3-ticket06-performance.json', `${JSON.stringify(evidence, null, 2)}\n`)
  log(JSON.stringify({ ...evidence, results: results.map((result) => ({ ...result, samplesMs: undefined })) }, null, 2))
  for (const result of results) {
    assert.equal(result.computationLimits, 0, `${result.name} must complete every exact solve`)
    assert.ok(result.p95Ms < 50, `${result.name} p95 ${result.p95Ms} ms must be below 50 ms`)
    assert.ok(Number.isFinite(result.result.withinRound?.drawExpectedDistance), `${result.name} must produce a complete exact comparison`)
    assert.equal(result.result.action, result.name === '4-7-6-remaining-49' ? 'STOP' : 'DRAW')
  }
} finally {
  await browser.close()
}
