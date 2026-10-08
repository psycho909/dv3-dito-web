import { describe, expect, it } from 'vitest'
import { createGameState, gameReducer } from '../../src/domain/gameReducer'
import { deriveRemainingDeck, score } from '../../src/domain'

function startedRound() {
  return gameReducer(createGameState(), {
    type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1',
    startedAt: '2026-10-08T09:00:00.000Z',
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
})
