import { INITIAL_DECK, RANKS, type Deck, type Rank } from './index'

export type RoundStatus = 'ACTIVE' | 'FINISHED'
export type SyncState = 'UNINITIALIZED' | 'SYNCED' | 'UNSYNCED'
export type CycleObservation = 'CONFIRMED_52' | 'DENIED'
export interface DeckCycle {
  readonly id: string
  readonly initialDeck: Deck
  readonly startedAt: string
  readonly reason: 'USER_CONFIRMED_FULL' | 'BELOW_15_NEXT_ROUND'
  readonly triggeredByRoundId?: string
  readonly previousRemaining?: number
  readonly observation?: CycleObservation
  readonly observedAt?: string
}
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
  readonly cycles: readonly DeckCycle[]
  readonly syncState: SyncState
  readonly activeRoundId?: string
}
export type GameAction =
  | {
    type: 'START_ROUND'; roundId: string; cycleId: string; startedAt: string
    cycleCreated?: { cycleId: string; reason: 'BELOW_15_NEXT_ROUND'; previousRemaining: number }
  }
  | { type: 'RECORD_DRAW'; roundId: string; rank: Rank }
  | { type: 'UNDO_DRAW'; roundId: string; rank: Rank }
  | { type: 'FINISH_ROUND'; roundId: string; finishedAt: string }
  | { type: 'CONFIRM_CYCLE_OBSERVATION'; cycleId: string; observation: CycleObservation; observedAt: string }

function immutableState(state: GameState): GameState {
  const frozenRounds = Object.freeze(state.rounds.map((round) => Object.freeze({
    ...round, draws: Object.freeze([...round.draws]),
  })))
  const frozenCycles = Object.freeze(state.cycles.map((cycle) => Object.freeze({
    ...cycle, initialDeck: Object.freeze({ ...cycle.initialDeck }),
  })))
  return Object.freeze({ ...state, rounds: frozenRounds, cycles: frozenCycles })
}

export function createGameState(): GameState {
  return immutableState({ rounds: [], cycles: [], syncState: 'UNINITIALIZED' })
}

/** 只消耗目前週期內的輸入；舊週期的剩餘石頭不帶入新週期。 */
export function deriveCycleDeck(state: GameState): Deck {
  const cycle = state.cycles.at(-1)
  if (!cycle) return INITIAL_DECK
  const remaining = { ...cycle.initialDeck }
  for (const round of state.rounds) {
    if (round.cycleId !== cycle.id) continue
    for (const rank of round.draws) remaining[rank] -= 1
  }
  return Object.freeze(remaining)
}

/** 時間與 ID 由呼叫端提供；建立週期與回合是同一個不可分割的事件。 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'CONFIRM_CYCLE_OBSERVATION') {
    const cycle = state.cycles.at(-1)
    if (!cycle || cycle.id !== action.cycleId || cycle.reason !== 'BELOW_15_NEXT_ROUND'
      || cycle.observation !== undefined
      || !['CONFIRMED_52', 'DENIED'].includes(action.observation)) return state
    return immutableState({ ...state,
      syncState: action.observation === 'DENIED' ? 'UNSYNCED' : 'SYNCED',
      cycles: state.cycles.map((item) => item.id === cycle.id
        ? { ...item, observation: action.observation, observedAt: action.observedAt } : item),
    })
  }
  if (action.type === 'START_ROUND') {
    if (state.activeRoundId !== undefined
      || state.rounds.some((round) => round.id === action.roundId)) return state
    const currentCycle = state.cycles.at(-1)
    let cycles = state.cycles
    let syncState = state.syncState
    if (!currentCycle) {
      if (action.cycleCreated) return state
      cycles = [{
        id: action.cycleId, initialDeck: INITIAL_DECK, reason: 'USER_CONFIRMED_FULL',
        startedAt: action.startedAt,
      }]
      syncState = 'SYNCED'
    } else {
      const deck = deriveCycleDeck(state)
      const previousRemaining = RANKS.reduce((sum, rank) => sum + deck[rank], 0)
      const created = action.cycleCreated
      if (previousRemaining < 15) {
        if (!created || created.reason !== 'BELOW_15_NEXT_ROUND'
          || created.cycleId !== action.cycleId || created.previousRemaining !== previousRemaining
          || state.cycles.some((cycle) => cycle.id === created.cycleId)) return state
        cycles = [...cycles, {
          id: created.cycleId, initialDeck: INITIAL_DECK, startedAt: action.startedAt,
          reason: created.reason, previousRemaining, triggeredByRoundId: action.roundId,
        }]
      } else if (created || action.cycleId !== currentCycle.id) return state
    }
    return immutableState({ ...state, cycles, syncState, rounds: [...state.rounds, {
      id: action.roundId, cycleId: action.cycleId, status: 'ACTIVE', draws: [],
      startedAt: action.startedAt,
    }], activeRoundId: action.roundId })
  }
  const current = state.rounds.find((round) => round.id === state.activeRoundId)
  if (!current || current.status !== 'ACTIVE' || current.id !== action.roundId) return state
  if (action.type === 'RECORD_DRAW') {
    if (!RANKS.includes(action.rank) || deriveCycleDeck(state)[action.rank] === 0) return state
    return immutableState({ ...state, rounds: state.rounds.map((round) => round.id === current.id
      ? { ...round, draws: [...round.draws, action.rank] } : round) })
  }
  if (action.type === 'UNDO_DRAW') {
    if (current.draws.length === 0 || current.draws.at(-1) !== action.rank) return state
    return immutableState({ ...state, rounds: state.rounds.map((round) => round.id === current.id
      ? { ...round, draws: round.draws.slice(0, -1) } : round) })
  }
  if (action.type === 'FINISH_ROUND') {
    return immutableState({ cycles: state.cycles, syncState: state.syncState,
      rounds: state.rounds.map((round) => round.id === current.id
        ? { ...round, status: 'FINISHED', finishedAt: action.finishedAt } : round) })
  }
  return state
}
