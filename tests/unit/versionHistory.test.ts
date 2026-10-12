import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import changelogMarkdown from '../../CHANGELOG.md?raw'
import { parseChangelog } from '../../src/domain/versionHistory'

const fixture = `# Changelog

Release notes.

## [Unreleased]

### Added

### Changed

### Fixed

## [1.1.0] - 2026-10-12

### Added

- Cloud backup.

### Changed

### Fixed

## [1.0.0] - 2026-10-11

### Added

- Local tracking.

### Changed

### Fixed
`

describe('version history', () => {
  it('parses the fixed release format and permits empty Unreleased sections', () => {
    expect(parseChangelog(fixture)).toEqual({
      unreleased: { Added: [], Changed: [], Fixed: [] },
      releases: [
        { version: '1.1.0', date: '2026-10-12', sections: { Added: ['Cloud backup.'], Changed: [], Fixed: [] } },
        { version: '1.0.0', date: '2026-10-11', sections: { Added: ['Local tracking.'], Changed: [], Fixed: [] } },
      ],
    })
  })

  it.each([
    ['unknown category', fixture.replace('### Changed', '### Security')],
    ['invalid date', fixture.replace('2026-10-12', '2026-02-30')],
    ['malformed entry', fixture.replace('- Cloud backup.', '* Cloud backup.')],
  ])('rejects a %s instead of silently omitting it', (_case, markdown) => {
    expect(() => parseChangelog(markdown)).toThrow()
  })

  it('keeps package.json version equal to the newest published changelog version', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string }
    const packageLock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')) as {
      version: string
      packages: { '': { version: string } }
    }
    const parsed = parseChangelog(changelogMarkdown)

    expect(parsed.releases[0]?.version).toBe(packageJson.version)
    expect(packageLock.version).toBe(packageJson.version)
    expect(packageLock.packages[''].version).toBe(packageJson.version)
  })
})
