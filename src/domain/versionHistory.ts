export type VersionSection = 'Added' | 'Changed' | 'Fixed'

export interface VersionRelease {
  version: string
  date: string
  sections: Record<VersionSection, string[]>
}

export interface ParsedChangelog {
  unreleased: Record<VersionSection, string[]>
  releases: VersionRelease[]
}

const SECTIONS: readonly VersionSection[] = ['Added', 'Changed', 'Fixed']
const VERSION_HEADER = /^## \[(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\] - (\d{4}-\d{2}-\d{2})$/

function emptySections(): Record<VersionSection, string[]> {
  return { Added: [], Changed: [], Fixed: [] }
}

function validateDate(date: string, lineNumber: number): void {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`)
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new Error(`CHANGELOG.md:${lineNumber}: invalid release date "${date}"`)
  }
}

function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!
  }
  return 0
}

function parseSections(lines: string[], startLine: number, version: string): Record<VersionSection, string[]> {
  const sections = emptySections()
  const seen = new Set<VersionSection>()
  let activeSection: VersionSection | null = null

  lines.forEach((line, index) => {
    const lineNumber = startLine + index
    if (line.startsWith('### ')) {
      const name = line.slice(4)
      if (!SECTIONS.includes(name as VersionSection)) {
        throw new Error(`CHANGELOG.md:${lineNumber}: unsupported section "${name}"`)
      }
      const section = name as VersionSection
      if (seen.has(section)) throw new Error(`CHANGELOG.md:${lineNumber}: duplicate section "${section}"`)
      seen.add(section)
      activeSection = section
      return
    }

    if (line.startsWith('#')) throw new Error(`CHANGELOG.md:${lineNumber}: unexpected heading`)
    if (line.trim() === '') return

    if (!line.startsWith('- ') || !activeSection || line.slice(2).trim() === '') {
      throw new Error(`CHANGELOG.md:${lineNumber}: expected a bullet under Added, Changed, or Fixed`)
    }
    sections[activeSection].push(line.slice(2).trim())
  })

  if (SECTIONS.some((section) => !seen.has(section))) {
    throw new Error(`CHANGELOG.md: version ${version} must contain Added, Changed, and Fixed sections`)
  }
  if (version !== 'Unreleased' && !SECTIONS.some((section) => sections[section].length > 0)) {
    throw new Error(`CHANGELOG.md: published version ${version} must contain at least one entry`)
  }
  return sections
}

export function parseChangelog(markdown: string): ParsedChangelog {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  if (lines[0] !== '# Changelog') throw new Error('CHANGELOG.md must start with "# Changelog"')

  const headerIndexes = lines.flatMap((line, index) => line.startsWith('## ') ? [index] : [])
  if (headerIndexes.length === 0) throw new Error('CHANGELOG.md must contain an Unreleased section')
  const firstHeader = headerIndexes[0]!
  const preamble = lines.slice(1, firstHeader)
  if (preamble.some((line) => line.startsWith('#') || line.startsWith('- '))) {
    throw new Error('CHANGELOG.md contains unsupported content before Unreleased')
  }
  if (lines[firstHeader] !== '## [Unreleased]') {
    throw new Error('CHANGELOG.md must start its release list with "## [Unreleased]"')
  }

  const parsed: ParsedChangelog = { unreleased: emptySections(), releases: [] }
  let previousVersion: readonly number[] | null = null

  headerIndexes.forEach((startIndex, headerIndex) => {
    const header = lines[startIndex]!
    const nextHeader = headerIndexes[headerIndex + 1] ?? lines.length
    const body = lines.slice(startIndex + 1, nextHeader)
    const startLine = startIndex + 2

    if (header === '## [Unreleased]') {
      if (headerIndex !== 0) throw new Error(`CHANGELOG.md:${startIndex + 1}: Unreleased must appear only first`)
      parsed.unreleased = parseSections(body, startLine, 'Unreleased')
      if (SECTIONS.some((section) => parsed.unreleased[section].length > 0)) {
        throw new Error('CHANGELOG.md: Unreleased must remain empty')
      }
      return
    }

    const match = header.match(VERSION_HEADER)
    if (!match) throw new Error(`CHANGELOG.md:${startIndex + 1}: invalid release header "${header}"`)
    const version = match.slice(1, 4).map(Number)
    const date = match[4]!
    validateDate(date, startIndex + 1)
    if (previousVersion && compareVersions(version, previousVersion) >= 0) {
      throw new Error(`CHANGELOG.md:${startIndex + 1}: releases must be in strictly descending SemVer order`)
    }
    previousVersion = version
    parsed.releases.push({
      version: `${match[1]}.${match[2]}.${match[3]}`,
      date,
      sections: parseSections(body, startLine, header),
    })
  })

  if (parsed.releases.length === 0) throw new Error('CHANGELOG.md must contain at least one published version')
  return parsed
}
