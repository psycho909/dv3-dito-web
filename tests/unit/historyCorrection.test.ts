import { describe, expect, it } from 'vitest'
import { createGameState, gameReducer, hydrateGameState } from '../../src/domain/gameReducer'
import { previewHistoryCorrection } from '../../src/domain/historyCorrection'
import type { Rank } from '../../src/domain'

const timestamp = '2026-10-11T12:00:00.000Z'
const thirtyEightDraws: Rank[] = [
  ...(['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const).flatMap((rank) =>
    Array.from({ length: 4 }, () => rank)),
  '10', '10',
]

function stateWithEstimatedRefill() {
  let state = gameReducer(createGameState(), {
    type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1', startedAt: timestamp,
  })
  for (const rank of thirtyEightDraws) {
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
  }
  state = gameReducer(state, {
    type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: timestamp,
  })
  return gameReducer(state, {
    type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-2', startedAt: timestamp,
    cycleCreated: { cycleId: 'cycle-2', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 },
  })
}

function stateWithFixedConfirmedBoundary(reason: 'USER_CONFIRMED_FULL' | 'MANUAL_RESET') {
  let state = gameReducer(createGameState(), {
    type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1', startedAt: timestamp,
  })
  const draws = thirtyEightDraws.slice(0, -1)
  for (const rank of draws) {
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
  }
  state = gameReducer(state, {
    type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: timestamp,
  })
  state = gameReducer(state, {
    type: 'START_ROUND', roundId: 'round-2', cycleId: 'fixed-cycle', startedAt: timestamp,
    cycleCreated: { cycleId: 'fixed-cycle', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 15 },
  })
  return hydrateGameState({
    ...state,
    cycles: state.cycles.map((cycle) => cycle.id === 'fixed-cycle' ? { ...cycle, reason } : cycle),
  })
}

describe('previewHistoryCorrection', () => {
  it.each(['cycle-1', 'round-1'])('拒絕修正 ID 與既有紀錄 %s 碰撞', (correctionId) => {
    const state = stateWithEstimatedRefill()
    expect(previewHistoryCorrection(state, {
      correctionId, correctedAt: timestamp, roundId: 'round-1',
      draws: thirtyEightDraws.slice(0, -1), reason: '移除誤記',
    })).toMatchObject({ ok: false, error: expect.stringContaining('ID') })
  })

  it('拒絕派生週期 ID 與回合 ID 碰撞', () => {
    const collidingId = 'history-correction:correction-add:cycle:round-2'
    let state = gameReducer(createGameState(), {
      type: 'START_ROUND', roundId: collidingId, cycleId: 'cycle-1', startedAt: timestamp,
    })
    for (const rank of thirtyEightDraws.slice(0, -2)) {
      state = gameReducer(state, { type: 'RECORD_DRAW', roundId: collidingId, rank })
    }
    state = gameReducer(state, { type: 'FINISH_ROUND', roundId: collidingId, finishedAt: timestamp })
    state = gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-1', startedAt: timestamp,
    })
    expect(previewHistoryCorrection(state, {
      correctionId: 'correction-add', correctedAt: timestamp, roundId: collidingId,
      draws: thirtyEightDraws.slice(0, -1), reason: '補入遺漏',
    })).toMatchObject({ ok: false, conflictRoundId: 'round-2', error: expect.stringContaining('ID') })
  })
  it('T22：剩餘數由 14 修正為 16 時，預覽移除推定邊界而不修改輸入', () => {
    const state = stateWithEstimatedRefill()
    const beforeRounds = state.rounds
    const preview = previewHistoryCorrection(state, {
      correctionId: 'correction-1', correctedAt: timestamp, roundId: 'round-1',
      draws: thirtyEightDraws.slice(0, -2), reason: '最後兩張 10 是誤記',
    })

    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.boundaryChanges).toEqual([{
      kind: 'REMOVED', cycleId: 'cycle-2', fromRoundId: 'round-2', previousRemaining: 14,
    }])
    expect(preview.nextState.rounds[0].draws).toHaveLength(36)
    expect(preview.nextState.rounds[1].cycleId).toBe('cycle-1')
    expect(preview.remainingTotal).toBe(16)
    expect(preview.warnings).toEqual([])
    expect(preview.nextState.corrections?.[0]).toMatchObject({
      id: 'correction-1', roundId: 'round-1', beforeDraws: thirtyEightDraws,
      afterDraws: thirtyEightDraws.slice(0, -2), reason: '最後兩張 10 是誤記',
    })
    expect(state.rounds).toBe(beforeRounds)
    expect(state.rounds[0].draws).toHaveLength(38)
  })

  it('拒絕 previousRemaining 與 round start 實際牌池不符的未觀察推定邊界', () => {
    const state = stateWithEstimatedRefill()
    const malformed = {
      ...state,
      cycles: state.cycles.map((cycle) => cycle.id === 'cycle-2'
        ? { ...cycle, previousRemaining: 15 } : cycle),
    }

    const preview = previewHistoryCorrection(malformed, {
      correctionId: 'correction-invalid-boundary', correctedAt: timestamp,
      roundId: 'round-1', draws: thirtyEightDraws.slice(0, -1),
      reason: '修正錯誤紀錄',
    })

    expect(preview.ok).toBe(false)
    if (preview.ok) return
    expect(preview.conflictRoundId).toBe('round-2')
  })

  it.each(['USER_CONFIRMED_FULL', 'MANUAL_RESET'] as const)(
    '%s 固定邊界即使原有 previousRemaining >= 15 且沒有 correction warning 也可修正',
    (reason) => {
      const state = stateWithFixedConfirmedBoundary(reason)
      const correctedDraws = [...state.rounds[0].draws]
      correctedDraws[0] = '10'

      const preview = previewHistoryCorrection(state, {
        correctionId: `correction-${reason}`, correctedAt: timestamp,
        roundId: 'round-1', draws: correctedDraws, reason: '修正錯記的點數',
      })

      expect(preview.ok, preview.ok ? '' : preview.error).toBe(true)
      if (!preview.ok) return
      expect(preview.boundaryChanges).toEqual([])
      expect(preview.warnings).toEqual([])
      expect(preview.nextState.cycles[1]).toMatchObject({
        reason, previousRemaining: 15, triggeredByRoundId: 'round-2',
      })
      expect(preview.nextState.corrections?.[0].warnings).toEqual(preview.warnings)
    },
  )

  it('T31：CONFIRMED_52 邊界固定，修正到 15 時保留且不新增 warning', () => {
    const state = gameReducer(stateWithEstimatedRefill(), {
      type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-2',
      observation: 'CONFIRMED_52', observedAt: timestamp,
    })
    const preview = previewHistoryCorrection(state, {
      correctionId: 'correction-confirmed', correctedAt: timestamp,
      roundId: 'round-1', draws: thirtyEightDraws.slice(0, -1),
      reason: '修正剩餘牌數',
    })

    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.boundaryChanges).toEqual([])
    expect(preview.nextState.rounds[1].cycleId).toBe('cycle-2')
    expect(preview.nextState.cycles[1]).toMatchObject({
      id: 'cycle-2', triggeredByRoundId: 'round-2', previousRemaining: 15,
      observation: 'CONFIRMED_52',
    })
    expect(preview.warnings).toEqual([])
    expect(preview.nextState.corrections?.[0].warnings).toEqual(preview.warnings)
    expect(preview.syncState).toBe('SYNCED')
  })

  it('新增推定邊界時以 correctionId 派生穩定 cycle ID', () => {
    let state = gameReducer(createGameState(), {
      type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1', startedAt: timestamp,
    })
    for (const rank of thirtyEightDraws.slice(0, -2)) {
      state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
    }
    state = gameReducer(state, {
      type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: timestamp,
    })
    state = gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-1', startedAt: timestamp,
    })
    const request = {
      correctionId: 'correction-add', correctedAt: timestamp, roundId: 'round-1',
      draws: thirtyEightDraws.slice(0, -1), reason: '補入遺漏的一張牌',
    }

    const first = previewHistoryCorrection(state, request)
    const second = previewHistoryCorrection(state, request)

    expect(first.ok).toBe(true)
    expect(second).toEqual(first)
    if (!first.ok) return
    expect(first.boundaryChanges).toEqual([{
      kind: 'ADDED', cycleId: 'history-correction:correction-add:cycle:round-2',
      toRoundId: 'round-2', previousRemaining: 15,
    }])
    expect(first.nextState.cycles[1]).toMatchObject({
      id: 'history-correction:correction-add:cycle:round-2',
      reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 15,
      triggeredByRoundId: 'round-2',
    })
    expect(state.rounds[0].draws).toHaveLength(36)
  })

  it('將推定邊界移到後一局，保留 cycle ID 並回報 MOVED', () => {
    let state = gameReducer(createGameState(), {
      type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1', startedAt: timestamp,
    })
    for (const rank of thirtyEightDraws) {
      state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
    }
    state = gameReducer(state, {
      type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: timestamp,
    })
    state = gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-2', startedAt: timestamp,
      cycleCreated: { cycleId: 'cycle-2', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 },
    })
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-2', rank: '10' })
    state = gameReducer(state, {
      type: 'FINISH_ROUND', roundId: 'round-2', finishedAt: timestamp,
    })
    state = gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-3', cycleId: 'cycle-2', startedAt: timestamp,
    })

    const preview = previewHistoryCorrection(state, {
      correctionId: 'correction-move', correctedAt: timestamp, roundId: 'round-1',
      draws: thirtyEightDraws.slice(0, -2), reason: '移除誤記的兩張牌',
    })

    expect(preview.ok, preview.ok ? '' : preview.error).toBe(true)
    if (!preview.ok) return
    expect(preview.boundaryChanges).toEqual([{
      kind: 'MOVED', cycleId: 'cycle-2', fromRoundId: 'round-2',
      toRoundId: 'round-3', previousRemaining: 15,
    }])
    expect(preview.nextState.rounds.map((round) => round.cycleId)).toEqual([
      'cycle-1', 'cycle-1', 'cycle-2',
    ])
    expect(preview.nextState.cycles[1]).toMatchObject({
      id: 'cycle-2', triggeredByRoundId: 'round-3', previousRemaining: 15,
    })
  })

  it('T20：超抽修正拒絕並指出第一個衝突回合', () => {
    const state = stateWithEstimatedRefill()
    const invalidDraws = [...thirtyEightDraws]
    invalidDraws[4] = 'A'
    const preview = previewHistoryCorrection(state, {
      correctionId: 'correction-overdraw', correctedAt: timestamp,
      roundId: 'round-1', draws: invalidDraws, reason: '錯把一張牌記成 A',
    })

    expect(preview).toMatchObject({
      ok: false, conflictRoundId: 'round-1',
      error: expect.stringContaining('超抽 A'),
    })
    expect(state.rounds[0].draws).toEqual(thirtyEightDraws)
    expect(state.cycles.map((cycle) => cycle.id)).toEqual(['cycle-1', 'cycle-2'])
  })

  it('保留同一 current cycle 的 Ticket08 UNSYNCED 目標且不因牌數相同自動同步', () => {
    const state = gameReducer(stateWithEstimatedRefill(), {
      type: 'VERIFY_REMAINING', gameRemaining: 51,
    })
    const correctedDraws = [...thirtyEightDraws]
    correctedDraws[0] = '10'
    const preview = previewHistoryCorrection(state, {
      correctionId: 'correction-unsynced-same-cycle', correctedAt: timestamp,
      roundId: 'round-1', draws: correctedDraws, reason: '修正錯記的點數',
    })

    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.syncState).toBe('UNSYNCED')
    expect(preview.nextState.verifiedRemainingCount).toBe(51)
    expect(preview.remainingTotal).toBe(52)
  })

  it('current cycle 改變時清除舊回報，明確核對相符總數即可恢復同步', () => {
    let state = gameReducer(stateWithEstimatedRefill(), {
      type: 'VERIFY_REMAINING', gameRemaining: 51,
    })
    const preview = previewHistoryCorrection(state, {
      correctionId: 'correction-unsynced-new-cycle', correctedAt: timestamp,
      roundId: 'round-1', draws: thirtyEightDraws.slice(0, -2),
      reason: '移除誤記的兩張牌',
    })

    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.syncState).toBe('UNSYNCED')
    expect(preview.nextState.verifiedRemainingCount).toBeUndefined()
    state = gameReducer(preview.nextState, { type: 'VERIFY_REMAINING', gameRemaining: 16 })
    expect(state.syncState).toBe('SYNCED')
    expect(state.verifiedRemainingCount).toBe(16)
  })

  it('保留 DENIED 邊界與 UNSYNCED 狀態，不因歷史修正洗掉否認', () => {
    let state = gameReducer(stateWithEstimatedRefill(), {
      type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-2',
      observation: 'DENIED', observedAt: timestamp,
    })
    state = gameReducer(state, { type: 'VERIFY_REMAINING', gameRemaining: 52 })
    const correctedDraws = [...thirtyEightDraws]
    correctedDraws[0] = '10'
    const preview = previewHistoryCorrection(state, {
      correctionId: 'correction-denied', correctedAt: timestamp,
      roundId: 'round-1', draws: correctedDraws, reason: '修正錯記的點數',
    })

    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.nextState.cycles[1]).toMatchObject({
      id: 'cycle-2', observation: 'DENIED', triggeredByRoundId: 'round-2',
    })
    expect(preview.syncState).toBe('UNSYNCED')
    expect(preview.nextState.verifiedRemainingCount).toBe(52)
  })

  it('後續修正可再新增邊界且保留每筆深度凍結 audit', () => {
    const original = stateWithEstimatedRefill()
    const firstRequest = {
      correctionId: 'correction-first', correctedAt: timestamp,
      roundId: 'round-1', draws: thirtyEightDraws.slice(0, -2), reason: '刪除誤記牌',
    }
    const first = gameReducer(original, { type: 'CORRECT_HISTORY', request: firstRequest })
    const secondRequest = {
      correctionId: 'correction-second', correctedAt: timestamp,
      roundId: 'round-1', draws: thirtyEightDraws, reason: '補回遺漏牌',
    }
    const second = gameReducer(first, { type: 'CORRECT_HISTORY', request: secondRequest })

    expect(first.corrections).toHaveLength(1)
    expect(first.corrections?.[0].afterDraws).toHaveLength(36)
    expect(second.corrections?.map((correction) => correction.id)).toEqual([
      'correction-first', 'correction-second',
    ])
    expect(second.cycles[1].id).toBe('history-correction:correction-second:cycle:round-2')
    expect(Object.isFrozen(second.corrections)).toBe(true)
    expect(Object.isFrozen(second.corrections?.[0].boundaryChanges)).toBe(true)
    expect(Object.isFrozen(second.corrections?.[0].boundaryChanges[0])).toBe(true)
    expect(original.rounds[0].draws).toHaveLength(38)
  })
})
