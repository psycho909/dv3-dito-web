import { describe, expect, it } from 'vitest'
import { createGameState, gameReducer } from '../../src/domain/gameReducer'
import { previewHistoryCorrection } from '../../src/domain/historyCorrection'
import {
  loadPersistedGame, LOCAL_STORAGE_KEY, savePersistedGame, type PersistenceStorage,
} from '../../src/services/persistence'

function memoryStorage(initialValue: string | null = null) {
  let value = initialValue
  const writes: Array<{ key: string; value: string }> = []
  const storage: PersistenceStorage = {
    getItem: () => value,
    setItem: (key, nextValue) => {
      writes.push({ key, value: nextValue })
      value = nextValue
    },
  }
  return { storage, writes, read: () => value }
}

function validEnvelope() {
  return JSON.stringify({
    session: {
      schemaVersion: 1,
      syncState: 'SYNCED',
      cycles: [{
        id: 'cycle-1',
        initialDeck: { A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4, '10': 16 },
        startedAt: '2026-10-08T09:00:00.000Z',
        reason: 'USER_CONFIRMED_FULL',
      }],
      rounds: [{
        id: 'round-1', cycleId: 'cycle-1', status: 'ACTIVE', draws: ['4', '7', '6'],
        startedAt: '2026-10-08T09:00:00.000Z',
      }],
      activeRoundId: 'round-1',
    },
    deviceId: '11111111-1111-4111-8111-111111111111',
    lastAcknowledgedCloudRevision: 0,
    pendingMutationBatches: [],
  })
}

function sameCycleBelow15CarryEnvelope() {
  const depletedDraws = [
    'A', 'A', 'A', 'A',
    ...['2', '3', '4', '5', '6', '7', '8', '9'].flatMap((rank) => [rank, rank, rank, rank]),
    '10', '10',
  ]
  return JSON.stringify({
    session: {
      schemaVersion: 1,
      syncState: 'SYNCED',
      cycles: [{
        id: 'cycle-1',
        initialDeck: { A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4, '10': 16 },
        startedAt: '2026-10-08T09:00:00.000Z',
        reason: 'USER_CONFIRMED_FULL',
      }],
      rounds: [
        {
          id: 'round-1', cycleId: 'cycle-1', status: 'FINISHED', draws: depletedDraws,
          startedAt: '2026-10-08T09:00:00.000Z', finishedAt: '2026-10-08T09:01:00.000Z',
        },
        {
          id: 'round-2', cycleId: 'cycle-1', status: 'ACTIVE', draws: [],
          startedAt: '2026-10-08T09:02:00.000Z',
        },
      ],
      activeRoundId: 'round-2',
    },
    deviceId: '11111111-1111-4111-8111-111111111111',
    lastAcknowledgedCloudRevision: 0,
    pendingMutationBatches: [],
  })
}

function refillEnvelope(options: { denied?: boolean; overdrawnPreviousCycle?: boolean } = {}) {
  const previousDraws = options.overdrawnPreviousCycle
    ? [
      'A', 'A', 'A', 'A', 'A',
      ...['2', '3', '4', '5', '6', '7', '8', '9'].flatMap((rank) => [rank, rank, rank, rank]),
      '10',
    ]
    : [
      'A', 'A', 'A', 'A',
      ...['2', '3', '4', '5', '6', '7', '8', '9'].flatMap((rank) => [rank, rank, rank, rank]),
      '10', '10',
    ]
  return JSON.stringify({
    session: {
      schemaVersion: 1,
      syncState: options.denied ? 'UNSYNCED' : 'SYNCED',
      cycles: [
        {
          id: 'cycle-1',
          initialDeck: { A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4, '10': 16 },
          startedAt: '2026-10-08T09:00:00.000Z',
          reason: 'USER_CONFIRMED_FULL',
        },
        {
          id: 'cycle-2',
          initialDeck: { A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4, '10': 16 },
          startedAt: '2026-10-08T09:04:00.000Z',
          reason: 'BELOW_15_NEXT_ROUND',
          triggeredByRoundId: 'round-3',
          previousRemaining: 14,
          ...(options.denied ? { observation: 'DENIED', observedAt: '2026-10-08T09:05:00.000Z' } : {}),
        },
      ],
      rounds: [
        {
          id: 'round-1', cycleId: 'cycle-1', status: 'FINISHED', draws: previousDraws.slice(0, 4),
          startedAt: '2026-10-08T09:00:00.000Z', finishedAt: '2026-10-08T09:01:00.000Z',
        },
        {
          id: 'round-2', cycleId: 'cycle-1', status: 'FINISHED', draws: previousDraws.slice(4),
          startedAt: '2026-10-08T09:02:00.000Z', finishedAt: '2026-10-08T09:03:00.000Z',
        },
        {
          id: 'round-3', cycleId: 'cycle-2', status: 'ACTIVE', draws: [],
          startedAt: '2026-10-08T09:04:00.000Z',
        },
      ],
      activeRoundId: 'round-3',
    },
    deviceId: '11111111-1111-4111-8111-111111111111',
    lastAcknowledgedCloudRevision: 0,
    pendingMutationBatches: [],
  })
}

describe('本機持久化', () => {
  it('修正已核對的同步牌池後保留目標並標示未同步，可保存重讀及明確重新核對', () => {
    const local = memoryStorage(validEnvelope())
    const loaded = loadPersistedGame(local.storage)
    if (!loaded.ok) throw new Error('fixture must load')
    const verified = gameReducer(loaded.state, { type: 'VERIFY_REMAINING', gameRemaining: 49 })
    const preview = previewHistoryCorrection(verified, {
      correctionId: 'correction-verified', correctedAt: '2026-10-11T12:00:00.000Z',
      roundId: 'round-1', draws: [], reason: '移除誤記的抽牌',
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.syncState).toBe('UNSYNCED')
    expect(preview.nextState.verifiedRemainingCount).toBe(49)
    expect(savePersistedGame(preview.nextState, local.read(), local.storage).ok).toBe(true)
    const restored = loadPersistedGame(local.storage)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.state.syncState).toBe('UNSYNCED')
    const wrongTarget = gameReducer(restored.state, { type: 'VERIFY_REMAINING', gameRemaining: 52 })
    expect(wrongTarget.syncState).toBe('UNSYNCED')
    expect(wrongTarget.verifiedRemainingCount).toBe(49)
    const repaired = gameReducer(wrongTarget, {
      type: 'CORRECT_HISTORY', request: {
        correctionId: 'correction-repair', correctedAt: '2026-10-11T12:01:00.000Z',
        roundId: 'round-1', draws: ['4', '7', '6'], reason: '補回已確認的點數',
      },
    })
    expect(repaired.syncState).toBe('UNSYNCED')
    const rechecked = gameReducer(repaired, { type: 'VERIFY_REMAINING', gameRemaining: 49 })
    expect(rechecked.syncState).toBe('SYNCED')
    expect(savePersistedGame(rechecked, local.read(), local.storage).ok).toBe(true)
    expect(loadPersistedGame(local.storage).ok).toBe(true)
  })
  it('保存修正前後與理由的稽核紀錄，重讀仍可追溯且不寫衍生機率', () => {
    const envelope = JSON.parse(validEnvelope())
    envelope.session.rounds[0].draws = ['4', '7', '5']
    envelope.session.corrections = [{
      id: 'correction-1', correctedAt: '2026-10-11T09:00:00.000Z', roundId: 'round-1',
      beforeDraws: ['4', '7', '6'], afterDraws: ['4', '7', '5'], reason: '第三顆誤記',
      boundaryChanges: [], warnings: [],
    }]
    const local = memoryStorage(JSON.stringify(envelope))
    const loaded = loadPersistedGame(local.storage)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(Reflect.get(loaded.state, 'corrections')).toEqual(envelope.session.corrections)
    expect(savePersistedGame(loaded.state, local.read(), local.storage).ok).toBe(true)
    expect(JSON.parse(local.read() ?? 'null').session.corrections).toEqual(envelope.session.corrections)
    expect(loadPersistedGame(local.storage).ok).toBe(true)
    for (const field of ['reason', 'roundId', 'id', 'afterDraws', 'boundaryChanges', 'warnings']) {
      const malformed = JSON.parse(local.read() ?? 'null')
      malformed.session.corrections[0][field] = field === 'reason' ? ' ' : null
      const invalidRaw = JSON.stringify(malformed)
      const invalid = loadPersistedGame(memoryStorage(invalidRaw).storage)
      expect(invalid.ok).toBe(false)
      expect(invalid.rawStoredData).toBe(invalidRaw)
    }
  })

  it('已確認補滿在歷史修正後可保留剩 15 的邊界及規則警告', () => {
    const envelope = JSON.parse(refillEnvelope())
    const beforeDraws = [...envelope.session.rounds[1].draws]
    envelope.session.rounds[1].draws.pop()
    envelope.session.cycles[1].previousRemaining = 15
    envelope.session.cycles[1].observation = 'CONFIRMED_52'
    envelope.session.cycles[1].observedAt = '2026-10-08T09:05:00.000Z'
    envelope.session.corrections = [{
      id: 'correction-1', correctedAt: '2026-10-11T09:00:00.000Z', roundId: 'round-2',
      beforeDraws, afterDraws: envelope.session.rounds[1].draws, reason: '移除誤記',
      boundaryChanges: [], warnings: [{
        cycleId: 'cycle-2', roundId: 'round-3', previousRemaining: 15,
        message: '曾確認遊戲補滿，但修正後剩 15 顆，與少於 15 規則不符。',
      }],
    }]
    const local = memoryStorage(JSON.stringify(envelope))
    const loaded = loadPersistedGame(local.storage)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.state.cycles[1]?.previousRemaining).toBe(15)
    expect(savePersistedGame(loaded.state, local.read(), local.storage).ok).toBe(true)
    expect(loadPersistedGame(local.storage).ok).toBe(true)
    const missingWarning = JSON.parse(local.read() ?? 'null')
    missingWarning.session.corrections[0].warnings = []
    expect(loadPersistedGame(memoryStorage(JSON.stringify(missingWarning)).storage).ok).toBe(false)
  })

  it('核對不一致可保存、重讀並補記恢復，而矛盾的 SYNCED 不能載入', () => {
    const raw = validEnvelope()
    const local = memoryStorage(raw)
    const loaded = loadPersistedGame(local.storage)
    if (!loaded.ok) throw new Error('fixture must load')
    const mismatch = gameReducer(loaded.state, { type: 'VERIFY_REMAINING', gameRemaining: 48 })
    const saved = savePersistedGame(mismatch, raw, local.storage)
    expect(saved.ok).toBe(true)
    const restored = loadPersistedGame(local.storage)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.state.syncState).toBe('UNSYNCED')
    expect(restored.state.verifiedRemainingCount).toBe(48)
    const fixed = gameReducer(restored.state, { type: 'RECORD_DRAW', roundId: 'round-1', rank: '2' })
    expect(savePersistedGame(fixed, local.read(), local.storage).ok).toBe(true)
    const awaitingRecheck = loadPersistedGame(local.storage)
    expect(awaitingRecheck.ok && awaitingRecheck.state.syncState).toBe('UNSYNCED')
    const rechecked = gameReducer(fixed, { type: 'VERIFY_REMAINING', gameRemaining: 48 })
    expect(savePersistedGame(rechecked, local.read(), local.storage).ok).toBe(true)
    const reloaded = loadPersistedGame(local.storage)
    expect(reloaded.ok && reloaded.state.syncState).toBe('SYNCED')

    const forged = JSON.parse(raw)
    forged.session.verifiedRemainingCount = 48
    expect(loadPersistedGame(memoryStorage(JSON.stringify(forged)).storage).ok).toBe(false)
  })

  it('未確認的新補滿週期允許保守 UNSYNCED 保存，確認後才恢復', () => {
    const parsed = JSON.parse(refillEnvelope())
    parsed.session.syncState = 'UNSYNCED'
    const raw = JSON.stringify(parsed)
    const local = memoryStorage(raw)
    const loaded = loadPersistedGame(local.storage)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const confirmed = gameReducer(loaded.state, {
      type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-2',
      observation: 'CONFIRMED_52', observedAt: '2026-10-08T09:05:00.000Z',
    })
    expect(confirmed.syncState).toBe('SYNCED')
    expect(savePersistedGame(confirmed, raw, local.storage).ok).toBe(true)
    expect(loadPersistedGame(local.storage).ok).toBe(true)
  })

  it.each(['startedAt', 'finishedAt', 'observedAt'] as const)(
    '拒絕 Date.parse 可解析但非標準 ISO 格式的 %s，並保留原始資料',
    (field) => {
      const malformed = JSON.parse(refillEnvelope({ denied: true })) as {
        session: {
          cycles: Array<Record<string, unknown>>
          rounds: Array<Record<string, unknown>>
        }
      }
      const noncanonical = 'October 8, 2026'
      expect(Number.isFinite(Date.parse(noncanonical))).toBe(true)
      if (field === 'startedAt') {
        malformed.session.cycles[0]!.startedAt = noncanonical
        malformed.session.rounds[0]!.startedAt = noncanonical
      } else if (field === 'finishedAt') {
        malformed.session.rounds[0]!.finishedAt = noncanonical
      } else {
        malformed.session.cycles[1]!.observedAt = noncanonical
      }
      const raw = JSON.stringify(malformed)
      const local = memoryStorage(raw)

      const result = loadPersistedGame(local.storage)

      expect(result).toMatchObject({ ok: false, rawStoredData: raw })
      expect(local.read()).toBe(raw)
      expect(local.writes).toEqual([])
    },
  )

  it('沒有已保存資料時以空白狀態啟動且不寫入', () => {
    const local = memoryStorage()

    const result = loadPersistedGame(local.storage)

    expect(LOCAL_STORAGE_KEY).toBe('dito-forge:local:v1')
    expect(result).toMatchObject({ ok: true, state: createGameState(), rawStoredData: null })
    expect(local.writes).toEqual([])
  })

  it('拒絕前一局只剩 14 顆卻沿用同一週期的新局資料', () => {
    const raw = sameCycleBelow15CarryEnvelope()
    const local = memoryStorage(raw)

    const result = loadPersistedGame(local.storage)

    expect(result).toMatchObject({ ok: false, rawStoredData: raw })
    expect(local.read()).toBe(raw)
    expect(local.writes).toEqual([])
  })

  it('載入已保存回合且不改寫原始資料，並回傳深度凍結狀態', () => {
    const raw = validEnvelope()
    const local = memoryStorage(raw)

    const result = loadPersistedGame(local.storage)

    expect(result).toMatchObject({
      ok: true,
      rawStoredData: raw,
      state: {
        activeRoundId: 'round-1',
        syncState: 'SYNCED',
        rounds: [{ id: 'round-1', draws: ['4', '7', '6'] }],
      },
    })
    if (result.ok) {
      expect(Object.isFrozen(result.state)).toBe(true)
      expect(Object.isFrozen(result.state.rounds)).toBe(true)
      expect(Object.isFrozen(result.state.rounds[0].draws)).toBe(true)
      expect(Object.isFrozen(result.state.cycles[0].initialDeck)).toBe(true)
    }
    expect(local.read()).toBe(raw)
    expect(local.writes).toEqual([])
  })

  it('以單一 envelope 保存 session、建立穩定裝置 ID，且不保存衍生機率', () => {
    const state = gameReducer(createGameState(), {
      type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1',
      startedAt: '2026-10-08T09:00:00.000Z',
    })
    const local = memoryStorage()

    const first = savePersistedGame(state, null, local.storage)

    expect(first.ok).toBe(true)
    expect(local.writes).toHaveLength(1)
    expect(local.writes[0]?.key).toBe(LOCAL_STORAGE_KEY)
    const envelope = JSON.parse(local.writes[0]?.value ?? 'null') as Record<string, unknown>
    expect(Object.keys(envelope).sort()).toEqual([
      'deviceId', 'lastAcknowledgedCloudRevision', 'pendingMutationBatches', 'session',
    ])
    expect(envelope.deviceId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(envelope.lastAcknowledgedCloudRevision).toBe(0)
    expect(envelope.pendingMutationBatches).toEqual([])
    expect(envelope).not.toHaveProperty('schemaVersion')
    expect(envelope.session).toMatchObject({ schemaVersion: 1, syncState: 'SYNCED' })
    expect(envelope.session).not.toHaveProperty('remainingDeck')
    expect(envelope.session).not.toHaveProperty('nextDraw')

    if (first.ok) {
      const second = savePersistedGame(state, first.rawStoredData, local.storage)
      expect(second.ok).toBe(true)
      const nextEnvelope = JSON.parse(local.writes[1]?.value ?? 'null') as Record<string, unknown>
      expect(nextEnvelope.deviceId).toBe(envelope.deviceId)
    }
  })

  it('抽牌後不再保存過期的 verifiedRemainingCount', () => {
    const parsed = JSON.parse(validEnvelope()) as {
      session: Record<string, unknown>
    }
    parsed.session.verifiedRemainingCount = 49
    const raw = JSON.stringify(parsed)
    const local = memoryStorage(raw)
    const loaded = loadPersistedGame(local.storage)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.state.verifiedRemainingCount).toBe(49)

    const next = gameReducer(loaded.state, { type: 'RECORD_DRAW', roundId: 'round-1', rank: '8' })
    const saved = savePersistedGame(next, raw, local.storage)

    expect(saved.ok).toBe(true)
    const envelope = JSON.parse(local.read() ?? 'null') as { session: Record<string, unknown> }
    expect(envelope.session).not.toHaveProperty('verifiedRemainingCount')
  })

  it('保留有效的 DENIED 觀察與 UNSYNCED 狀態', () => {
    const raw = refillEnvelope({ denied: true })
    const local = memoryStorage(raw)

    const loaded = loadPersistedGame(local.storage)

    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.state.syncState).toBe('UNSYNCED')
      expect(loaded.state.cycles[1]).toMatchObject({
        observation: 'DENIED', observedAt: '2026-10-08T09:05:00.000Z',
      })
      const saved = savePersistedGame(loaded.state, raw, local.storage)
      expect(saved.ok).toBe(true)
      const envelope = JSON.parse(local.read() ?? 'null') as { session: Record<string, unknown> }
      expect(envelope.session).toMatchObject({ syncState: 'UNSYNCED' })
      expect(envelope.session.cycles[1]).toMatchObject({ observation: 'DENIED' })
    }
    expect(local.writes).toHaveLength(1)
  })

  it('拒絕非字串 observation，即使其字串化結果是有效列舉值', () => {
    const malformed = JSON.parse(refillEnvelope()) as {
      session: { cycles: Array<Record<string, unknown>> }
    }
    malformed.session.cycles[1]!.observation = ['DENIED']
    malformed.session.cycles[1]!.observedAt = '2026-10-08T09:05:00.000Z'
    const raw = JSON.stringify(malformed)
    const local = memoryStorage(raw)

    const result = loadPersistedGame(local.storage)

    expect(result).toMatchObject({ ok: false, rawStoredData: raw })
    expect(local.read()).toBe(raw)
    expect(local.writes).toEqual([])
  })

  it('拒絕跨回合累積後超過牌種庫存的舊週期', () => {
    const raw = refillEnvelope({ overdrawnPreviousCycle: true })
    const local = memoryStorage(raw)

    const result = loadPersistedGame(local.storage)

    expect(result).toMatchObject({ ok: false, rawStoredData: raw })
    expect(local.read()).toBe(raw)
    expect(local.writes).toEqual([])
  })

  it('拒絕未支援的 session 版本且保留原始資料', () => {
    const value = JSON.parse(validEnvelope()) as { session: Record<string, unknown> }
    value.session.schemaVersion = 2
    const raw = JSON.stringify(value)
    const local = memoryStorage(raw)

    const result = loadPersistedGame(local.storage)

    expect(result).toMatchObject({ ok: false, rawStoredData: raw })
    expect(local.read()).toBe(raw)
    expect(local.writes).toEqual([])
  })

  it('拒絕衍生牌池資料與不合法的 verifiedRemainingCount', () => {
    const withDerivedData = JSON.parse(validEnvelope()) as { session: Record<string, unknown> }
    withDerivedData.session.remainingDeck = { A: 4 }
    const derivedRaw = JSON.stringify(withDerivedData)
    const derived = loadPersistedGame(memoryStorage(derivedRaw).storage)
    expect(derived).toMatchObject({ ok: false, rawStoredData: derivedRaw })

    const withInvalidVerification = JSON.parse(validEnvelope()) as { session: Record<string, unknown> }
    withInvalidVerification.session.verifiedRemainingCount = 53
    const verificationRaw = JSON.stringify(withInvalidVerification)
    const invalidVerification = loadPersistedGame(memoryStorage(verificationRaw).storage)
    expect(invalidVerification).toMatchObject({ ok: false, rawStoredData: verificationRaw })
  })

  it('拒絕不相符的 activeRoundId、時間配對與非預設雲端欄位', () => {
    const mismatchedActive = JSON.parse(validEnvelope()) as { session: Record<string, unknown> }
    mismatchedActive.session.activeRoundId = 'missing-round'
    const activeRaw = JSON.stringify(mismatchedActive)
    expect(loadPersistedGame(memoryStorage(activeRaw).storage))
      .toMatchObject({ ok: false, rawStoredData: activeRaw })

    const unpairedObservation = JSON.parse(refillEnvelope({ denied: true })) as {
      session: { cycles: Array<Record<string, unknown>> }
    }
    delete unpairedObservation.session.cycles[1]?.observedAt
    const observationRaw = JSON.stringify(unpairedObservation)
    expect(loadPersistedGame(memoryStorage(observationRaw).storage))
      .toMatchObject({ ok: false, rawStoredData: observationRaw })

    const cloudEnabled = JSON.parse(validEnvelope()) as Record<string, unknown>
    cloudEnabled.cloudAccountId = 'account-1'
    const cloudRaw = JSON.stringify(cloudEnabled)
    expect(loadPersistedGame(memoryStorage(cloudRaw).storage))
      .toMatchObject({ ok: false, rawStoredData: cloudRaw })
  })

  it('讀取失敗時回報錯誤且不嘗試寫入', () => {
    const writes: string[] = []
    const storage: PersistenceStorage = {
      getItem: () => { throw new Error('read denied') },
      setItem: (_key, value) => writes.push(value),
    }

    const result = loadPersistedGame(storage)

    expect(result).toMatchObject({ ok: false, rawStoredData: null })
    expect(writes).toEqual([])
  })

  it('偵測到外部分頁的新 raw 時拒絕覆寫並保留該 raw', () => {
    const externalRaw = validEnvelope()
    const local = memoryStorage(externalRaw)

    const result = savePersistedGame(createGameState(), null, local.storage)

    expect(result).toMatchObject({ ok: false, rawStoredData: externalRaw })
    expect(local.read()).toBe(externalRaw)
    expect(local.writes).toEqual([])
  })

  it('寫入失敗時回報未提交並保留先前 raw', () => {
    const raw = validEnvelope()
    const storage: PersistenceStorage = {
      getItem: () => raw,
      setItem: () => { throw new Error('quota exceeded') },
    }

    const result = savePersistedGame(createGameState(), raw, storage)

    expect(result).toMatchObject({ ok: false, rawStoredData: raw })
  })
})
