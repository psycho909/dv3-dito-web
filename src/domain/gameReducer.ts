import { deriveRemainingDeck, RANKS, type Rank } from './index'

export type RoundStatus = 'ACTIVE' | 'FINISHED'
export interface RoundRecord {
  readonly id: string
  readonly cycleId: string
  readonly status: RoundStatus
  readonly draws: readonly Rank[]
  readonly startedAt: string
  readonly finishedAt?: string
}
export interface GameState {
  readonly rounds: readonly RoundRecord[]
  readonly activeRoundId?: string
}
export type GameAction =
  | { type: 'START_ROUND'; roundId: string; cycleId: string; startedAt: string }
  | { type: 'RECORD_DRAW'; roundId: string; rank: Rank }
  | { type: 'UNDO_DRAW'; roundId: string; rank: Rank }
  | { type: 'FINISH_ROUND'; roundId: string; finishedAt: string }

function immutableState(rounds: readonly RoundRecord[], activeRoundId?: string): GameState {
  const frozenRounds = Object.freeze(rounds.map((round) => Object.freeze({
    ...round, draws: Object.freeze([...round.draws]),
  })))
  return Object.freeze(activeRoundId === undefined
    ? { rounds: frozenRounds }
    : { rounds: frozenRounds, activeRoundId })
}

export function createGameState(): GameState {
  return immutableState([])
}

/** 同一牌池內的本局事件；時間與 ID 由呼叫端提供，不含補滿或持久化。 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'START_ROUND') {
    if (state.activeRoundId !== undefined
      || state.rounds.some((round) => round.id === action.roundId)
      || state.rounds.some((round) => round.cycleId !== action.cycleId)) return state
    return immutableState([...state.rounds, {
      id: action.roundId, cycleId: action.cycleId, status: 'ACTIVE', draws: [],
      startedAt: action.startedAt,
    }], action.roundId)
  }
  const current = state.rounds.find((round) => round.id === state.activeRoundId)
  if (!current || current.status !== 'ACTIVE' || current.id !== action.roundId) return state
  if (action.type === 'RECORD_DRAW') {
    const consumed = state.rounds.flatMap((round) => round.draws)
    if (!RANKS.includes(action.rank) || deriveRemainingDeck(consumed)[action.rank] === 0) return state
    return immutableState(state.rounds.map((round) => round.id === current.id
      ? { ...round, draws: [...round.draws, action.rank] } : round), current.id)
  }
  if (action.type === 'UNDO_DRAW') {
    if (current.draws.length === 0 || current.draws.at(-1) !== action.rank) return state
    return immutableState(state.rounds.map((round) => round.id === current.id
      ? { ...round, draws: round.draws.slice(0, -1) } : round), current.id)
  }
  if (action.type === 'FINISH_ROUND') {
    return immutableState(state.rounds.map((round) => round.id === current.id
      ? { ...round, status: 'FINISHED', finishedAt: action.finishedAt } : round))
  }
  return state
}
