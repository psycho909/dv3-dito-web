import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { parseChangelog } from './src/domain/versionHistory'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const changelog = readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8')
const latestRelease = parseChangelog(changelog).releases[0]

if (!latestRelease || latestRelease.version !== packageJson.version) {
  throw new Error(`package.json version ${packageJson.version} must match the newest published CHANGELOG.md version`)
}

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
})
