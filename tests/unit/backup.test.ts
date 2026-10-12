import { describe, expect, it } from 'vitest'
import { createGameState, deriveCycleDeck, gameReducer } from '../../src/domain/gameReducer'
import { previewHistoryCorrection } from '../../src/domain/historyCorrection'
import {
  MAX_BACKUP_BYTES, parseGameBackup, serializeGameBackup, summarizeGameState,
} from '../../src/services/backup'
import { savePersistedGame, type PersistenceStorage } from '../../src/services/persistence'
import type { BackupSummary } from '../../src/services/backup'

function backupState() {
  let state = gameReducer(createGameState(), {
    type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1',
    startedAt: '2026-10-08T09:00:00.000Z',
  })
  for (const rank of ['4', '7', '6'] as const) {
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
  }
  state = gameReducer(state, { type: 'VERIFY_REMAINING', gameRemaining: 48 })
  state = gameReducer(state, { type: 'VERIFY_REMAINING', gameRemaining: 47 })
  const correction = previewHistoryCorrection(state, {
    correctionId: 'correction-1', correctedAt: '2026-10-08T09:05:00.000Z',
    roundId: 'round-1', draws: ['4', '7', '5'], reason: '修正歷史中的誤記',
  })
  if (!correction.ok) throw new Error('backup fixture must pass history validation')
  return correction.nextState
}

function persistedSession(state = backupState()) {
  let raw: string | null = null
  const storage: PersistenceStorage = {
    getItem: () => raw,
    setItem: (_key, value) => { raw = value },
  }
  const saved = savePersistedGame(state, null, storage)
  if (!saved.ok) throw new Error('backup fixture must be persistable')
  return JSON.parse(saved.rawStoredData).session as Record<string, unknown>
}

describe('遊戲備份資料邊界', () => {
  it('匯出 schema 1 session 並 roundtrip 保留修正稽核與未同步目標', () => {
    const state = backupState()
    const raw = serializeGameBackup(state)
    const exported = JSON.parse(raw) as Record<string, unknown>

    expect(Object.keys(exported).sort()).toEqual([
      'activeRoundId', 'corrections', 'cycles', 'rounds', 'schemaVersion', 'syncState', 'verifiedRemainingCount',
    ])
    expect(exported).toMatchObject({ schemaVersion: 1, syncState: 'UNSYNCED', verifiedRemainingCount: 47 })
    for (const field of ['deviceId', 'cloudAccountId', 'lastBackupAt', 'pendingMutationBatches', 'authToken']) {
      expect(exported).not.toHaveProperty(field)
    }

    const imported = parseGameBackup(raw)

    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.state).toEqual(state)
    expect(imported.state.corrections).toEqual(state.corrections)
    expect(imported.state.verifiedRemainingCount).toBe(47)
    expect(deriveCycleDeck(imported.state)).toEqual(deriveCycleDeck(state))
    expect(Object.isFrozen(imported.state)).toBe(true)
    expect(Object.isFrozen(imported.state.rounds[0]?.draws)).toBe(true)
    expect(Object.isFrozen(imported.state.corrections)).toBe(true)
  })

  it('摘要只衍生回合、週期、抽牌、當前手牌、庫存與 syncState', () => {
    const state = backupState()

    const summary: BackupSummary = summarizeGameState(state)

    expect(summary).toEqual({
      roundCount: 1, cycleCount: 1, drawCount: 3, currentHand: ['4', '7', '5'],
      remainingTotal: 49, syncState: 'UNSYNCED',
    })
    expect(summarizeGameState(createGameState())).toEqual({
      roundCount: 0, cycleCount: 0, drawCount: 0, currentHand: [], remainingTotal: 0,
      syncState: 'UNINITIALIZED',
    })

    const finished = gameReducer(state, {
      type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: '2026-10-08T09:06:00.000Z',
    })
    expect(finished.activeRoundId).toBeUndefined()
    expect(summarizeGameState(finished).currentHand).toEqual(['4', '7', '5'])
  })

  it.each([
    ['unsupported schema version', (session: Record<string, unknown>) => { session.schemaVersion = 2 }],
    ['unknown rank', (session: Record<string, unknown>) => {
      ;(session.rounds as Array<{ draws: unknown[] }>)[0]!.draws[0] = 'JOKER'
    }],
    ['overdrawn rank', (session: Record<string, unknown>) => {
      ;(session.rounds as Array<{ draws: unknown[] }>)[0]!.draws = ['A', 'A', 'A', 'A', 'A']
    }],
    ['cross-entity duplicate ID', (session: Record<string, unknown>) => {
      ;(session.rounds as Array<{ id: string }>)[0]!.id = 'cycle-1'
    }],
    ['unknown field', (session: Record<string, unknown>) => { session.extra = true }],
    ['authentication field', (session: Record<string, unknown>) => { session.authToken = 'not-a-credential' }],
  ])('拒絕 %s 且不調整輸入', (_label, mutate) => {
    const malformed = persistedSession()
    mutate(malformed)
    const raw = JSON.stringify(malformed)

    expect(parseGameBackup(raw)).toMatchObject({ ok: false, error: expect.any(String) })
    expect(JSON.parse(raw)).toEqual(malformed)
  })

  it('只接受 session JSON，拒絕本機 envelope 與非 JSON 程式文字', () => {
    const state = backupState()
    let stored: string | null = null
    const storage: PersistenceStorage = {
      getItem: () => stored,
      setItem: (_key, value) => { stored = value },
    }
    const saved = savePersistedGame(state, null, storage)
    if (!saved.ok) throw new Error('backup fixture must be persistable')
    expect(parseGameBackup(saved.rawStoredData)).toMatchObject({ ok: false, error: expect.any(String) })
    expect(parseGameBackup('(() => { throw new Error("executed") })()'))
      .toMatchObject({ ok: false, error: expect.any(String) })
  })

  it('拒絕尾隨重複 session 欄位注入的非獨立 JSON', () => {
    const first = serializeGameBackup(backupState())
    const secondState = gameReducer(createGameState(), {
      type: 'START_ROUND', roundId: 'other-round', cycleId: 'other-cycle',
      startedAt: '2026-10-08T09:10:00.000Z',
    })
    const injected = `${first},"session":${serializeGameBackup(secondState)}`

    expect(parseGameBackup(injected)).toMatchObject({ ok: false, error: expect.any(String) })
  })

  it('深巢狀非法 JSON 回傳格式錯誤而不拋出例外', () => {
    const raw = `{"schemaVersion":1,"extra":${'['.repeat(12000)}0${']'.repeat(12000)}}`

    expect(new TextEncoder().encode(raw).byteLength).toBeLessThan(MAX_BACKUP_BYTES)
    expect(parseGameBackup(raw)).toMatchObject({ ok: false, error: expect.any(String) })
  })

  it('接受剛好 5 MiB 的 UTF-8 JSON，拒絕多一個位元組', () => {
    const valid = serializeGameBackup(backupState())
    const bytes = new TextEncoder().encode(valid).byteLength
    const exactLimit = `${valid}${' '.repeat(MAX_BACKUP_BYTES - bytes)}`

    expect(new TextEncoder().encode(exactLimit).byteLength).toBe(MAX_BACKUP_BYTES)
    expect(exactLimit.length).toBeLessThan(MAX_BACKUP_BYTES)
    expect(parseGameBackup(exactLimit).ok).toBe(true)
    expect(parseGameBackup(`${exactLimit} `)).toMatchObject({ ok: false, error: expect.any(String) })
  })
})
