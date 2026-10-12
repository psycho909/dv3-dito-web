import { createGameState, gameReducer, type GameState } from '../../../src/domain/gameReducer'

function recordDepletingDraws(state: GameState, roundId: string): GameState {
  let next = state
  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
    for (let i = 0; i < 4; i += 1) {
      next = gameReducer(next, { type: 'RECORD_DRAW', roundId, rank })
    }
  }
  for (let i = 0; i < 2; i += 1) {
    next = gameReducer(next, { type: 'RECORD_DRAW', roundId, rank: '10' })
  }
  return next
}

export function deniedThenUnobservedRefillState(): GameState {
  let state = gameReducer(createGameState(), {
    type: 'START_ROUND', roundId: 'round-1', cycleId: 'cycle-1',
    startedAt: '2026-10-08T09:00:00.000Z',
  })
  state = recordDepletingDraws(state, 'round-1')
  state = gameReducer(state, {
    type: 'FINISH_ROUND', roundId: 'round-1', finishedAt: '2026-10-08T09:01:00.000Z',
  })
  state = gameReducer(state, {
    type: 'START_ROUND', roundId: 'round-2', cycleId: 'cycle-2',
    startedAt: '2026-10-08T09:02:00.000Z',
    cycleCreated: { cycleId: 'cycle-2', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 },
  })
  state = gameReducer(state, {
    type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: 'cycle-2', observation: 'DENIED',
    observedAt: '2026-10-08T09:03:00.000Z',
  })
  state = recordDepletingDraws(state, 'round-2')
  state = gameReducer(state, {
    type: 'FINISH_ROUND', roundId: 'round-2', finishedAt: '2026-10-08T09:04:00.000Z',
  })
  return gameReducer(state, {
    type: 'START_ROUND', roundId: 'round-3', cycleId: 'cycle-3',
    startedAt: '2026-10-08T09:05:00.000Z',
    cycleCreated: { cycleId: 'cycle-3', reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 },
  })
}
