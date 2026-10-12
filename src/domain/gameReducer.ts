import { INITIAL_DECK, RANKS, type Deck, type Rank } from './index'
import { previewHistoryCorrection, type HistoryCorrectionRequest } from './historyCorrection'
import type { HistoryCorrection } from './historyCorrection'
import { REFILL_THRESHOLD } from './rules'

export type RoundStatus = 'ACTIVE' | 'FINISHED'
export type SyncState = 'UNINITIALIZED' | 'SYNCED' | 'UNSYNCED'
export type CycleObservation = 'CONFIRMED_52' | 'DENIED'
export interface DeckCycle {
  readonly id: string
  readonly initialDeck: Deck
  readonly startedAt: string
  // Keep the persisted name; BELOW_15_NEXT_ROUND now includes exactly 15.
  readonly reason: 'USER_CONFIRMED_FULL' | 'MANUAL_RESET' | 'BELOW_15_NEXT_ROUND'
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
  readonly verifiedRemainingCount?: number
  readonly corrections?: readonly HistoryCorrection[]
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
  | { type: 'VERIFY_REMAINING'; gameRemaining: number }
  | { type: 'CORRECT_HISTORY'; request: HistoryCorrectionRequest }
  | { type: 'MANUAL_RESET'; roundId: string; cycleId: string; resetAt: string }
  | { type: 'IMPORT_OVERWRITE'; state: GameState }

function immutableState(state: GameState): GameState {
  const frozenRounds = Object.freeze(state.rounds.map((round) => Object.freeze({
    ...round, draws: Object.freeze([...round.draws]),
  })))
  const frozenCycles = Object.freeze(state.cycles.map((cycle) => Object.freeze({
    ...cycle, initialDeck: Object.freeze({ ...cycle.initialDeck }),
  })))
  const corrections = state.corrections === undefined ? undefined : Object.freeze(state.corrections.map((correction) =>
    Object.freeze({
      ...correction,
      beforeDraws: Object.freeze([...correction.beforeDraws]),
      afterDraws: Object.freeze([...correction.afterDraws]),
      boundaryChanges: Object.freeze(correction.boundaryChanges.map((change) => Object.freeze({ ...change }))),
      warnings: Object.freeze(correction.warnings.map((warning) => Object.freeze({ ...warning }))),
    })))
  return Object.freeze({
    ...state,
    rounds: frozenRounds,
    cycles: frozenCycles,
    ...(corrections === undefined ? {} : { corrections }),
  })
}

function withoutVerifiedRemainingCount(state: GameState): Omit<GameState, 'verifiedRemainingCount'> {
  return {
    rounds: state.rounds,
    cycles: state.cycles,
    syncState: state.syncState,
    ...(state.corrections === undefined ? {} : { corrections: state.corrections }),
    ...(state.activeRoundId === undefined ? {} : { activeRoundId: state.activeRoundId }),
  }
}

export function createGameState(): GameState {
  return immutableState({ rounds: [], cycles: [], syncState: 'UNINITIALIZED' })
}

/** 載入前由 persistence 驗證資料；在此建立與 reducer 相同的深度凍結狀態。 */
export function hydrateGameState(state: GameState): GameState {
  return immutableState(state)
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

function remainingTotal(state: GameState): number {
  const deck = deriveCycleDeck(state)
  return RANKS.reduce((sum, rank) => sum + deck[rank], 0)
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

/** 修補輸入保留核對目標，仍需玩家核對當下遊戲數量，避免舊目標過時後誤恢復。 */
function reconcileRecordedDraws(previous: GameState, next: GameState): GameState {
  if (previous.syncState !== 'UNSYNCED' || previous.verifiedRemainingCount === undefined) {
    return immutableState(withoutVerifiedRemainingCount(next))
  }
  return immutableState({ ...next,
    syncState: 'UNSYNCED',
    verifiedRemainingCount: previous.verifiedRemainingCount,
  })
}

/** 時間與 ID 由呼叫端提供；建立週期與回合是同一個不可分割的事件。 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'CORRECT_HISTORY') {
    const preview = previewHistoryCorrection(state, action.request)
    return preview.ok ? preview.nextState : state
  }
  if (action.type === 'IMPORT_OVERWRITE') {
    // The import boundary must validate the full session before dispatching this trusted replacement.
    return hydrateGameState(action.state)
  }
  if (action.type === 'VERIFY_REMAINING') {
    if (state.syncState === 'UNINITIALIZED' || !Number.isInteger(action.gameRemaining)
      || action.gameRemaining < 0 || action.gameRemaining > 52) return state
    const matched = action.gameRemaining === remainingTotal(state)
    // 再次填入工具總數不能抹掉之前回報的不一致，必須修復點數紀錄。
    const cycle = state.cycles.at(-1)
    const confirmedBaseline = cycle?.reason === 'USER_CONFIRMED_FULL' || cycle?.reason === 'MANUAL_RESET'
      || cycle?.observation === 'CONFIRMED_52'
    const repaired = matched && confirmedBaseline && state.verifiedRemainingCount === action.gameRemaining
    if (state.syncState === 'UNSYNCED' && state.verifiedRemainingCount !== undefined
      && state.verifiedRemainingCount !== action.gameRemaining) return state
    const syncState = matched && (state.syncState === 'SYNCED' || repaired) ? 'SYNCED' : 'UNSYNCED'
    if (state.verifiedRemainingCount === action.gameRemaining && state.syncState === syncState) return state
    return immutableState({ ...state, syncState, verifiedRemainingCount: action.gameRemaining })
  }
  if (action.type === 'CONFIRM_CYCLE_OBSERVATION') {
    const cycle = state.cycles.at(-1)
    if (!cycle || cycle.id !== action.cycleId || cycle.reason !== 'BELOW_15_NEXT_ROUND'
      || cycle.observation !== undefined
      || !['CONFIRMED_52', 'DENIED'].includes(action.observation)) return state
    return immutableState({ ...state,
      syncState: action.observation === 'DENIED'
        || (state.verifiedRemainingCount !== undefined
          && (state.verifiedRemainingCount !== 52 || remainingTotal(state) !== 52))
        ? 'UNSYNCED' : 'SYNCED',
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
      if (previousRemaining <= REFILL_THRESHOLD) {
        if (!created || created.reason !== 'BELOW_15_NEXT_ROUND'
          || created.cycleId !== action.cycleId || created.previousRemaining !== previousRemaining
          || state.cycles.some((cycle) => cycle.id === created.cycleId)) return state
        cycles = [...cycles, {
          id: created.cycleId, initialDeck: INITIAL_DECK, startedAt: action.startedAt,
          reason: created.reason, previousRemaining, triggeredByRoundId: action.roundId,
        }]
      } else if (created || action.cycleId !== currentCycle.id) return state
    }
    const base = !currentCycle || action.cycleCreated
      ? withoutVerifiedRemainingCount(state) : state
    return immutableState({ ...base, cycles, syncState, rounds: [...state.rounds, {
      id: action.roundId, cycleId: action.cycleId, status: 'ACTIVE', draws: [],
      startedAt: action.startedAt,
    }], activeRoundId: action.roundId })
  }
  if (action.type === 'MANUAL_RESET') {
    if (state.syncState === 'UNINITIALIZED' || state.cycles.length === 0
      || !validIdentifier(action.roundId) || !validIdentifier(action.cycleId)
      || action.roundId === action.cycleId || !isCanonicalTimestamp(action.resetAt)) return state
    const existingIds = new Set([
      ...state.cycles.map((cycle) => cycle.id),
      ...state.rounds.map((round) => round.id),
      ...(state.corrections ?? []).map((correction) => correction.id),
    ])
    if (existingIds.has(action.roundId) || existingIds.has(action.cycleId)) return state

    const currentDeck = deriveCycleDeck(state)
    const previousRemaining = RANKS.reduce((sum, rank) => sum + currentDeck[rank], 0)
    const lastRoundIndex = state.rounds.length - 1
    const lastRound = state.rounds.at(-1)
    const rounds = lastRound?.status === 'ACTIVE'
      ? state.rounds.map((round, index) => index === lastRoundIndex
        ? { ...round, status: 'FINISHED' as const, finishedAt: action.resetAt } : round)
      : state.rounds
    return immutableState({
      ...withoutVerifiedRemainingCount(state),
      cycles: [...state.cycles, {
        id: action.cycleId,
        initialDeck: INITIAL_DECK,
        startedAt: action.resetAt,
        reason: 'MANUAL_RESET',
        triggeredByRoundId: action.roundId,
        previousRemaining,
      }],
      rounds: [...rounds, {
        id: action.roundId,
        cycleId: action.cycleId,
        status: 'ACTIVE',
        draws: [],
        startedAt: action.resetAt,
      }],
      syncState: 'SYNCED',
      activeRoundId: action.roundId,
    })
  }
  const current = state.rounds.find((round) => round.id === state.activeRoundId)
  if (!current || current.status !== 'ACTIVE' || current.id !== action.roundId) return state
  if (action.type === 'RECORD_DRAW') {
    if (!RANKS.includes(action.rank) || deriveCycleDeck(state)[action.rank] === 0) return state
    return reconcileRecordedDraws(state, { ...state, rounds: state.rounds.map((round) => round.id === current.id
      ? { ...round, draws: [...round.draws, action.rank] } : round) })
  }
  if (action.type === 'UNDO_DRAW') {
    if (current.draws.length === 0 || current.draws.at(-1) !== action.rank) return state
    return reconcileRecordedDraws(state, { ...state, rounds: state.rounds.map((round) => round.id === current.id
      ? { ...round, draws: round.draws.slice(0, -1) } : round) })
  }
  if (action.type === 'FINISH_ROUND') {
    return immutableState({ cycles: state.cycles, syncState: state.syncState,
      ...(state.corrections === undefined ? {} : { corrections: state.corrections }),
      ...(state.verifiedRemainingCount === undefined
        ? {} : { verifiedRemainingCount: state.verifiedRemainingCount }),
      rounds: state.rounds.map((round) => round.id === current.id
        ? { ...round, status: 'FINISHED', finishedAt: action.finishedAt } : round) })
  }
  return state
}
