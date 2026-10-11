import { readdir, readFile, stat } from 'node:fs/promises'
import { error as logError, log } from 'node:console'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const forbiddenName = /(^|\/)(?:\.env(?:\..*)?|[^/]*(?:secret|credential|private[-_]?key)[^/]*|id_rsa(?:\.pub)?|.*\.(?:pem|key|p12|pfx))$/i

async function walk(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const name = relative ? `${relative}/${entry.name}` : entry.name
    const absolute = path.join(directory, entry.name)
    if (forbiddenName.test(name)) throw new Error(`forbidden credential-like artifact name: ${name}`)
    if (entry.isDirectory()) files.push(...await walk(absolute, name))
    else if (entry.isFile()) files.push(name)
    else throw new Error(`unsupported artifact entry: ${name}`)
  }

  return files
}

try {
  if (!(await stat(dist)).isDirectory()) throw new Error('dist is not a directory')
  const files = (await walk(dist)).sort()
  if (!files.includes('index.html')) throw new Error('dist/index.html is missing')
  if (files.some((file) => file.startsWith('docs/') || file.includes('/references/'))) {
    throw new Error('documentation/reference files are present in dist')
  }
  if (files.some((file) => file !== 'index.html' && !file.startsWith('assets/'))) {
    throw new Error('unexpected file outside dist/index.html and dist/assets/')
  }

  const html = await readFile(path.join(dist, 'index.html'), 'utf8')
  const referencedAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
    .map((match) => match[1].slice(1))
  if (referencedAssets.length === 0) throw new Error('dist/index.html references no built assets')
  for (const asset of referencedAssets) {
    if (!files.includes(asset)) throw new Error(`index.html references missing asset: ${asset}`)
  }

  log(`Artifact check passed: ${files.length} files; index references ${referencedAssets.length} existing assets.`)
  log('Scope: checks output layout, forbidden-name patterns, and index asset references; it cannot guarantee detection of arbitrary secret strings.')
} catch (error) {
  logError(`Artifact check failed: ${error.message}`)
  process.exitCode = 1
}
