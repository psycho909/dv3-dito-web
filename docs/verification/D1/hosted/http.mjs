/* global fetch */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { log } from 'node:console'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const origin = 'https://dv3-dito-web.vercel.app'
const config = JSON.parse(await readFile('vercel.json', 'utf8'))
const manifest = await readFile('docs/verification/D1/dist-manifest.sha256', 'utf8')
const results = []
for (const line of manifest.trim().split(/\r?\n/)) {
  const [expectedHash, file] = line.trim().split(/\s+/)
  const path = file === 'dist/index.html' ? '/' : file.slice(4)
  const response = await fetch(origin + path)
  assert.equal(response.status, 200)
  const headers = {}
  for (const { key, value } of config.headers[0].headers) {
    headers[key] = response.headers.get(key)
    assert.equal(headers[key], value)
  }
  const hash = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
  assert.equal(hash, expectedHash)
  results.push({ path, status: response.status, headers, sha256: hash })
}
for (const path of ['/assets/d1-missing.js', '/docs/references/d1-missing.png', '/.env', '/README.md']) {
  const response = await fetch(origin + path)
  assert.equal(response.status, 404)
  results.push({ path, status: response.status })
}
await writeFile('docs/verification/D1/hosted/http.json', JSON.stringify({
  checkedAt: new Date().toISOString(), origin,
  sourceCommit: '08146000ad7440bb9940cbad7056f7844ea3519a', results,
  limitation: 'Known artifact hashes and sampled absent paths do not prove absence of every possible secret.',
}, null, 2) + '\n')
log('PASS: 3 hosted artifacts match the recorded hashes and headers; 4 absent paths return 404')
