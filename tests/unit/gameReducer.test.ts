import { describe, expect, it } from 'vitest'
import { createGameState, deriveCycleDeck, gameReducer } from '../../src/domain/gameReducer'
import { deriveRemainingDeck, INITIAL_DECK, score } from '../../src/domain'

function startedRound() {
  return gameReducer(createGameState(), {
    type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1',
    startedAt: '2026-10-08T09:00:00.000Z',
  })
}

function refilledRound() {
  let state = startedRound()
  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
    for (let i = 0; i < 4; i++) state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
  }
  for (let i = 0; i < 2; i++) state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank: '10' })
  state = gameReducer(state, { type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: '2026-10-08T09:01:00.000Z' })
  return gameReducer(state, {
    type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-2', startedAt: '2026-10-08T09:02:00.000Z',
    cycleCreated: { cycleId: 'cycle-2', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 },
  })
}

describe('本局事件 reducer', () => {
  it('以指定 ID 與時間建立 ACTIVE 回合，不修改輸入狀態', () => {
    const initial = createGameState()
    const started = gameReducer(initial, {
      type: 'START_ROUND',
      roundId: 'round-1',
      cycleId: 'cycle-1',
      startedAt: '2026-10-08T09:00:00.000Z',
    })
    expect(initial.rounds).toEqual([])
    expect(started.activeRoundId).toBe('round-1')
    expect(started.rounds).toEqual([{
      id: 'round-1', cycleId: 'cycle-1', status: 'ACTIVE', draws: [],
      startedAt: '2026-10-08T09:00:00.000Z',
    }])
    expect(gameReducer(started, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-1',
      startedAt: '2026-10-08T09:01:00.000Z',
    })).toBe(started)
  })

  it('確認完整牌池的第一局建立可追溯 USER_CONFIRMED_FULL 週期', () => {
    const initial = createGameState()
    expect(initial.syncState).toBe('UNINITIALIZED')
    expect(initial.cycles).toEqual([])
    const state = startedRound()
    expect(state.syncState).toBe('SYNCED')
    expect(state.cycles).toEqual([{
      id: 'cycle-1', initialDeck: INITIAL_DECK, reason: 'USER_CONFIRMED_FULL',
      startedAt: '2026-10-08T09:00:00.000Z',
    }])
    expect(Object.isFrozen(state.cycles[0].initialDeck)).toBe(true)
  })

  it('AC-07：撤回本局最後一顆，還原庫存，空手牌不能再撤銷', () => {
    let state = startedRound()
    for (const rank of ['4', '7', '6'] as const) {
      state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
    }
    const beforeUndo = state
    state = gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: '6' })
    expect(beforeUndo.rounds[0].draws).toEqual(['4', '7', '6'])
    expect(state.rounds[0].draws).toEqual(['4', '7'])
    expect(score(state.rounds[0].draws)).toBe(11)
    expect(deriveRemainingDeck(state.rounds[0].draws)['6']).toBe(4)
    expect(Object.values(deriveRemainingDeck(state.rounds[0].draws)).reduce((sum, count) => sum + count, 0)).toBe(50)
    expect(gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: '4' })).toBe(state)
    state = gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: '7' })
    state = gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: '4' })
    expect(state.rounds[0].draws).toEqual([])
    expect(gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: '4' })).toBe(state)
  })

  it('AC-02：完成後鎖定、開新局保留上一局，不能跨局撤銷', () => {
    let state = startedRound()
    for (const rank of ['4', '7', '6'] as const) {
      state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
    }
    state = gameReducer(state, {
      type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: '2026-10-08T09:02:00.000Z',
    })
    expect(state.activeRoundId).toBeUndefined()
    expect(state.rounds[0]).toMatchObject({
      status: 'FINISHED', draws: ['4', '7', '6'], finishedAt: '2026-10-08T09:02:00.000Z',
    })
    expect(gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank: '2' })).toBe(state)
    expect(gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: '6' })).toBe(state)
    state = gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-1', startedAt: '2026-10-08T09:03:00.000Z',
    })
    expect(state.rounds[1].draws).toEqual([])
    expect(score(state.rounds[1].draws)).toBe(0)
    const deck = deriveRemainingDeck(state.rounds.flatMap((round) => round.draws))
    expect(deck['4']).toBe(3)
    expect(deck['7']).toBe(3)
    expect(deck['6']).toBe(3)
    expect(Object.values(deck).reduce((sum, count) => sum + count, 0)).toBe(49)
    expect(gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-2', rank: '6' })).toBe(state)
    const recorded = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-2', rank: '2' })
    const undone = gameReducer(recorded, { type: 'UNDO_DRAW', roundId: 'round-2', rank: '2' })
    expect(undone.rounds[0]).toEqual(state.rounds[0])
    expect(undone.rounds[1].draws).toEqual([])
  })

  it('拒絕舊局事件、重複 ID、不同牌池及跨局用罄點數', () => {
    let state = startedRound()
    expect(gameReducer(state, { type: 'RECORD_DRAW', roundId: 'old', rank: 'A' })).toBe(state)
    expect(gameReducer(state, { type: 'FINISH_ROUND', roundId: 'old', finishedAt: '2026-10-08T09:01:00.000Z' })).toBe(state)
    expect(Reflect.apply(gameReducer, undefined, [state, {
      type: 'RECORD_DRAW', roundId: 'round-1', rank: 'JOKER',
    }])).toBe(state)
    for (let i = 0; i < 4; i++) state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank: 'A' })
    expect(gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank: 'A' })).toBe(state)
    state = gameReducer(state, { type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: '2026-10-08T09:01:00.000Z' })
    expect(gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1', startedAt: '2026-10-08T09:02:00.000Z',
    })).toBe(state)
    expect(gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'different', startedAt: '2026-10-08T09:02:00.000Z',
    })).toBe(state)
    state = gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-1', startedAt: '2026-10-08T09:02:00.000Z',
    })
    expect(gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-2', rank: 'A' })).toBe(state)
    expect(gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: 'A' })).toBe(state)
    expect(Object.isFrozen(state.rounds)).toBe(true)
    expect(Object.isFrozen(state.rounds[0])).toBe(true)
    expect(Object.isFrozen(state.rounds[0].draws)).toBe(true)
  })

  it('未知事件不應意外完成正在記錄的回合', () => {
    const state = startedRound()
    expect(Reflect.apply(gameReducer, undefined, [state, {
      type: 'UNKNOWN_ACTION', roundId: 'round-1',
    }])).toBe(state)
  })

  it('AC-03／T21：剩 15 沿用，局中剩 14 不補，下一局才建立週期', () => {
    let state = startedRound()
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      for (let i = 0; i < 4; i++) state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank })
    }
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-1', rank: '10' })
    state = gameReducer(state, { type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: '2026-10-08T09:01:00.000Z' })
    state = gameReducer(state, { type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-1', startedAt: '2026-10-08T09:02:00.000Z' })
    expect(state.cycles).toHaveLength(1)
    expect(state.rounds[1].cycleId).toBe('cycle-1')
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-2', rank: '10' })
    expect(state.cycles).toHaveLength(1)
    expect(state.rounds[1].draws).toEqual(['10'])
    state = gameReducer(state, { type: 'FINISH_ROUND', roundId: 'round-2', finishedAt: '2026-10-08T09:03:00.000Z' })
    const previous = state
    state = gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-3', cycleId: 'cycle-2', startedAt: '2026-10-08T09:04:00.000Z',
      cycleCreated: { cycleId: 'cycle-2', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 },
    })
    expect(state.cycles).toHaveLength(2)
    expect(state.cycles[1]).toEqual({
      id: 'cycle-2', initialDeck: INITIAL_DECK, startedAt: '2026-10-08T09:04:00.000Z',
      reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14, triggeredByRoundId: 'round-3',
    })
    expect(state.rounds.slice(0, 2)).toEqual(previous.rounds)
    expect(state.rounds[2].draws).toEqual([])
    expect(state.rounds[2].cycleId).toBe('cycle-2')
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-3', rank: 'A' })
    expect(state.rounds[2].draws).toEqual(['A'])
  })

  it('T32：觀察事件只修改目前推定週期，否認後保留庫存並標記 UNSYNCED', () => {
    const state = refilledRound()
    expect(state.cycles[1].observation).toBeUndefined()
    for (const observation of ['CONFIRMED_52', 'DENIED'] as const) {
      const observed = gameReducer(state, {
        type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-2', observation,
        observedAt: '2026-10-08T09:03:00.000Z',
      })
      expect(observed.cycles[1]).toMatchObject({ observation, observedAt: '2026-10-08T09:03:00.000Z' })
      expect(observed.syncState).toBe(observation === 'DENIED' ? 'UNSYNCED' : 'SYNCED')
      expect(observed.cycles[0]).toEqual(state.cycles[0])
      expect(observed.rounds).toEqual(state.rounds)
      expect(gameReducer(observed, {
        type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-2', observation: 'CONFIRMED_52',
        observedAt: '2026-10-08T09:04:00.000Z',
      })).toBe(observed)
    }
    expect(gameReducer(state, {
      type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-1', observation: 'DENIED',
      observedAt: '2026-10-08T09:03:00.000Z',
    })).toBe(state)
  })

  it('拒絕偽造補滿資料，並只消耗目前週期的 initialDeck', () => {
    let state = startedRound()
    state = gameReducer(state, { type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: '2026-10-08T09:01:00.000Z' })
    expect(gameReducer(state, {
      type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-2', startedAt: '2026-10-08T09:02:00.000Z',
      cycleCreated: { cycleId: 'cycle-2', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 },
    })).toBe(state)
    state = refilledRound()
    expect(deriveCycleDeck(state)).toEqual(INITIAL_DECK)
    state = gameReducer(state, { type: 'RECORD_DRAW', roundId: 'round-2', rank: 'A' })
    expect(deriveCycleDeck(state)).toEqual({ ...INITIAL_DECK, A: 3 })
    expect(gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-1', rank: '10' })).toBe(state)
    state = gameReducer(state, { type: 'UNDO_DRAW', roundId: 'round-2', rank: 'A' })
    expect(deriveCycleDeck(state)).toEqual(INITIAL_DECK)
    expect(state.rounds[0].draws).toHaveLength(38)
    expect(Reflect.apply(gameReducer, undefined, [state, {
      type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-2', observation: 'INVALID', observedAt: '2026-10-08T09:03:00.000Z',
    }])).toBe(state)
    expect(Object.isFrozen(state.cycles)).toBe(true)
    expect(Object.isFrozen(state.cycles[1])).toBe(true)
  })
})
