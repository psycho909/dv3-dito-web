import {
  createGameState, hydrateGameState,
  type CycleObservation, type DeckCycle, type GameState, type RoundRecord, type SyncState,
} from '../domain/gameReducer'
import { INITIAL_DECK, RANKS, type Deck, type Rank, validateDeck } from '../domain'

export const LOCAL_STORAGE_KEY = 'dito-forge:local:v1'

export interface PersistenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type PersistenceLoadResult =
  | { ok: true; state: GameState; rawStoredData: string | null }
  | { ok: false; error: string; rawStoredData: string | null }

export type PersistenceSaveResult =
  | { ok: true; rawStoredData: string }
  | { ok: false; error: string; rawStoredData: string | null }

const INVALID_DATA_ERROR = '本機資料格式不正確，原始資料已保留。'
const UNSUPPORTED_VERSION_ERROR = '本機資料版本不相容，原始資料已保留。'
const UNSUPPORTED_CLOUD_ERROR = '本機資料包含尚未支援的雲端同步內容，原始資料已保留。'

type DecodeResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key))
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function validCycleDeck(value: unknown): value is Deck {
  return validateDeck(value) && RANKS.every((rank) => value[rank] === INITIAL_DECK[rank])
}

function decodeEnvelope(rawStoredData: string): DecodeResult {
  let value: unknown
  try {
    value = JSON.parse(rawStoredData)
  } catch {
    return { ok: false, error: INVALID_DATA_ERROR }
  }

  if (!isRecord(value)) return { ok: false, error: INVALID_DATA_ERROR }
  if (!hasExactKeys(value, [
    'session', 'deviceId', 'lastAcknowledgedCloudRevision', 'pendingMutationBatches',
  ], ['cloudAccountId', 'lastBackupAt'])) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }
  if (Object.hasOwn(value, 'cloudAccountId') || Object.hasOwn(value, 'lastBackupAt')) {
    return { ok: false, error: UNSUPPORTED_CLOUD_ERROR }
  }
  if (typeof value.deviceId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.deviceId)
    || typeof value.lastAcknowledgedCloudRevision !== 'number'
    || !Number.isInteger(value.lastAcknowledgedCloudRevision)
    || value.lastAcknowledgedCloudRevision < 0
    || !Array.isArray(value.pendingMutationBatches)) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }
  if (value.lastAcknowledgedCloudRevision !== 0 || value.pendingMutationBatches.length > 0) {
    return { ok: false, error: UNSUPPORTED_CLOUD_ERROR }
  }

  const session = value.session
  if (!isRecord(session) || !Object.hasOwn(session, 'schemaVersion')) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }
  if (session.schemaVersion !== 1) {
    return { ok: false, error: UNSUPPORTED_VERSION_ERROR }
  }
  if (!hasExactKeys(session, ['schemaVersion', 'syncState', 'cycles', 'rounds'], [
    'activeRoundId', 'verifiedRemainingCount',
  ]) || (session.syncState !== 'UNINITIALIZED' && session.syncState !== 'SYNCED'
    && session.syncState !== 'UNSYNCED')
    || !Array.isArray(session.cycles) || !Array.isArray(session.rounds)) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }

  const syncState = session.syncState as SyncState
  const ids = new Set<string>()
  const cycles: DeckCycle[] = []
  for (const item of session.cycles) {
    if (!isRecord(item) || !hasExactKeys(item, ['id', 'initialDeck', 'startedAt', 'reason'], [
      'triggeredByRoundId', 'previousRemaining', 'observation', 'observedAt',
    ]) || !validIdentifier(item.id) || !validCycleDeck(item.initialDeck)
      || !validTimestamp(item.startedAt)
      || (item.reason !== 'USER_CONFIRMED_FULL' && item.reason !== 'BELOW_15_NEXT_ROUND')
      || ids.has(item.id)) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }
    ids.add(item.id)
    const hasTriggeredBy = Object.hasOwn(item, 'triggeredByRoundId')
    const hasPreviousRemaining = Object.hasOwn(item, 'previousRemaining')
    const hasObservation = Object.hasOwn(item, 'observation')
    const hasObservedAt = Object.hasOwn(item, 'observedAt')
    if (hasObservation !== hasObservedAt
      || (hasObservation && ((item.observation !== 'CONFIRMED_52' && item.observation !== 'DENIED')
        || !validTimestamp(item.observedAt)))) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }

    const reason = item.reason as DeckCycle['reason']
    if (cycles.length === 0) {
      if (reason !== 'USER_CONFIRMED_FULL' || hasTriggeredBy || hasPreviousRemaining
        || hasObservation || hasObservedAt) return { ok: false, error: INVALID_DATA_ERROR }
    } else if (reason !== 'BELOW_15_NEXT_ROUND' || !hasTriggeredBy || !validIdentifier(item.triggeredByRoundId)
      || !hasPreviousRemaining || typeof item.previousRemaining !== 'number'
      || !Number.isInteger(item.previousRemaining) || item.previousRemaining < 0 || item.previousRemaining >= 15) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }

    cycles.push({
      id: item.id,
      initialDeck: item.initialDeck,
      startedAt: item.startedAt,
      reason,
      ...(hasTriggeredBy ? { triggeredByRoundId: item.triggeredByRoundId as string } : {}),
      ...(hasPreviousRemaining ? { previousRemaining: item.previousRemaining as number } : {}),
      ...(hasObservation ? { observation: item.observation as CycleObservation } : {}),
      ...(hasObservedAt ? { observedAt: item.observedAt as string } : {}),
    })
  }

  const cycleIndexes = new Map(cycles.map((cycle, index) => [cycle.id, index]))
  const rounds: RoundRecord[] = []
  const firstRoundByCycle = new Map<string, RoundRecord>()
  let previousCycleIndex = -1
  for (const item of session.rounds) {
    if (!isRecord(item) || !hasExactKeys(item, ['id', 'cycleId', 'status', 'draws', 'startedAt'], ['finishedAt'])
      || !validIdentifier(item.id) || !validIdentifier(item.cycleId) || ids.has(item.id)
      || (item.status !== 'ACTIVE' && item.status !== 'FINISHED') || !Array.isArray(item.draws)
      || !item.draws.every((rank): rank is Rank => typeof rank === 'string' && RANKS.includes(rank as Rank))
      || !validTimestamp(item.startedAt)) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }
    ids.add(item.id)
    const cycleIndex = cycleIndexes.get(item.cycleId)
    if (cycleIndex === undefined || cycleIndex < previousCycleIndex) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }
    previousCycleIndex = cycleIndex

    const hasFinishedAt = Object.hasOwn(item, 'finishedAt')
    if ((item.status === 'FINISHED' && (!hasFinishedAt || !validTimestamp(item.finishedAt)))
      || (item.status === 'ACTIVE' && hasFinishedAt)) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }
    const round: RoundRecord = {
      id: item.id,
      cycleId: item.cycleId,
      status: item.status,
      draws: item.draws,
      startedAt: item.startedAt,
      ...(hasFinishedAt ? { finishedAt: item.finishedAt as string } : {}),
    }
    rounds.push(round)
    if (!firstRoundByCycle.has(round.cycleId)) firstRoundByCycle.set(round.cycleId, round)
  }

  const initialDeckTotal = RANKS.reduce((sum, rank) => sum + INITIAL_DECK[rank], 0)
  const remainingByCycle = new Map(cycles.map((cycle) => [cycle.id, { ...cycle.initialDeck }]))
  const remainingTotalsByCycle = new Map(cycles.map((cycle) => [cycle.id, initialDeckTotal]))
  let previousRoundCycleId: string | undefined
  for (const round of rounds) {
    const remaining = remainingByCycle.get(round.cycleId)
    let remainingTotal = remainingTotalsByCycle.get(round.cycleId)
    if (!remaining || remainingTotal === undefined) return { ok: false, error: INVALID_DATA_ERROR }
    if (previousRoundCycleId === round.cycleId && remainingTotal < 15) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }
    for (const rank of round.draws) {
      remaining[rank] -= 1
      remainingTotal -= 1
      if (remaining[rank] < 0 || remainingTotal < 0) return { ok: false, error: INVALID_DATA_ERROR }
    }
    remainingTotalsByCycle.set(round.cycleId, remainingTotal)
    previousRoundCycleId = round.cycleId
  }

  const uninitialized = syncState === 'UNINITIALIZED'
  if (uninitialized ? cycles.length !== 0 || rounds.length !== 0 : cycles.length === 0 || rounds.length === 0) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }
  if (cycles.some((cycle) => !firstRoundByCycle.has(cycle.id))) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }
  for (let index = 0; index < cycles.length; index += 1) {
    const cycle = cycles[index]
    const firstRound = firstRoundByCycle.get(cycle.id)
    if (!cycle || !firstRound || firstRound.startedAt !== cycle.startedAt) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }
    if (index > 0) {
      const previousCycle = cycles[index - 1]
      const firstCycleRound = firstRoundByCycle.get(cycle.id)
      const previousRemaining = previousCycle
        ? remainingTotalsByCycle.get(previousCycle.id) : undefined
      if (!previousCycle || !firstCycleRound || cycle.triggeredByRoundId !== firstCycleRound.id
        || cycle.previousRemaining !== previousRemaining) {
        return { ok: false, error: INVALID_DATA_ERROR }
      }
    }
  }

  const activeRounds = rounds.filter((round) => round.status === 'ACTIVE')
  const hasActiveRoundId = Object.hasOwn(session, 'activeRoundId')
  if (hasActiveRoundId) {
    if (!validIdentifier(session.activeRoundId) || activeRounds.length !== 1
      || activeRounds[0]?.id !== session.activeRoundId || rounds.at(-1)?.id !== session.activeRoundId) {
      return { ok: false, error: INVALID_DATA_ERROR }
    }
  } else if (activeRounds.length !== 0) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }

  if (Object.hasOwn(session, 'verifiedRemainingCount')
    && (typeof session.verifiedRemainingCount !== 'number'
      || !Number.isInteger(session.verifiedRemainingCount)
      || session.verifiedRemainingCount < 0 || session.verifiedRemainingCount > 52)) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }
  const latestObservation = [...cycles].reverse().find((cycle) => cycle.observation !== undefined)?.observation
  const expectedSyncState = latestObservation === 'DENIED' ? 'UNSYNCED' : 'SYNCED'
  if (!uninitialized && syncState !== expectedSyncState) {
    return { ok: false, error: INVALID_DATA_ERROR }
  }

  return {
    ok: true,
    state: hydrateGameState({
      cycles,
      rounds,
      syncState,
      ...(hasActiveRoundId ? { activeRoundId: session.activeRoundId as string } : {}),
      ...(Object.hasOwn(session, 'verifiedRemainingCount')
        ? { verifiedRemainingCount: session.verifiedRemainingCount as number } : {}),
    }),
  }
}

function resolveStorage(storage?: PersistenceStorage): PersistenceStorage {
  if (storage) return storage
  if (typeof window === 'undefined') throw new Error('Storage is unavailable')
  return window.localStorage
}

export function loadPersistedGame(storage?: PersistenceStorage): PersistenceLoadResult {
  let rawStoredData: string | null = null
  try {
    rawStoredData = resolveStorage(storage).getItem(LOCAL_STORAGE_KEY)
  } catch {
    return { ok: false, error: '無法讀取本機資料，記錄功能已暫停。', rawStoredData }
  }

  if (rawStoredData === null) {
    return { ok: true, state: createGameState(), rawStoredData: null }
  }

  const decoded = decodeEnvelope(rawStoredData)
  if (!decoded.ok) return { ok: false, error: decoded.error, rawStoredData }
  return { ...decoded, rawStoredData }
}

function toPersistedSession(state: GameState) {
  return {
    schemaVersion: 1,
    syncState: state.syncState,
    cycles: state.cycles.map((cycle) => ({
      id: cycle.id,
      initialDeck: { ...cycle.initialDeck },
      startedAt: cycle.startedAt,
      reason: cycle.reason,
      ...(cycle.triggeredByRoundId === undefined ? {} : { triggeredByRoundId: cycle.triggeredByRoundId }),
      ...(cycle.previousRemaining === undefined ? {} : { previousRemaining: cycle.previousRemaining }),
      ...(cycle.observation === undefined ? {} : { observation: cycle.observation }),
      ...(cycle.observedAt === undefined ? {} : { observedAt: cycle.observedAt }),
    })),
    rounds: state.rounds.map((round) => ({
      id: round.id,
      cycleId: round.cycleId,
      status: round.status,
      draws: [...round.draws],
      startedAt: round.startedAt,
      ...(round.finishedAt === undefined ? {} : { finishedAt: round.finishedAt }),
    })),
    ...(state.activeRoundId === undefined ? {} : { activeRoundId: state.activeRoundId }),
    ...(typeof state.verifiedRemainingCount === 'number'
      && Number.isInteger(state.verifiedRemainingCount)
      && state.verifiedRemainingCount >= 0 && state.verifiedRemainingCount <= 52
      ? { verifiedRemainingCount: state.verifiedRemainingCount } : {}),
  }
}

export function savePersistedGame(
  state: GameState,
  expectedRaw: string | null,
  storage?: PersistenceStorage,
): PersistenceSaveResult {
  let localStorage: PersistenceStorage
  let observedRaw: string | null
  try {
    localStorage = resolveStorage(storage)
    observedRaw = localStorage.getItem(LOCAL_STORAGE_KEY)
  } catch {
    return {
      ok: false,
      error: '無法讀取本機資料，這次變更未套用。',
      rawStoredData: expectedRaw,
    }
  }

  // This detects writes observed before this operation; localStorage has no compare-and-swap primitive.
  if (observedRaw !== expectedRaw) {
    return {
      ok: false,
      error: '本機資料已在其他分頁變更，這次操作未套用；請重新讀取。',
      rawStoredData: observedRaw,
    }
  }

  let deviceId: string
  if (expectedRaw === null) {
    try {
      deviceId = globalThis.crypto.randomUUID()
    } catch {
      return { ok: false, error: '無法建立本機裝置識別碼，這次變更未套用。', rawStoredData: expectedRaw }
    }
  } else {
    const decoded = decodeEnvelope(expectedRaw)
    if (!decoded.ok) return { ok: false, error: decoded.error, rawStoredData: expectedRaw }
    try {
      deviceId = (JSON.parse(expectedRaw) as { deviceId: string }).deviceId
    } catch {
      return { ok: false, error: INVALID_DATA_ERROR, rawStoredData: expectedRaw }
    }
  }

  const envelope = {
    session: toPersistedSession(state),
    deviceId,
    lastAcknowledgedCloudRevision: 0,
    pendingMutationBatches: [],
  }
  let nextRaw: string
  try {
    nextRaw = JSON.stringify(envelope)
    localStorage.setItem(LOCAL_STORAGE_KEY, nextRaw)
  } catch {
    return { ok: false, error: '本機資料寫入失敗，這次變更未套用。', rawStoredData: expectedRaw }
  }
  return { ok: true, rawStoredData: nextRaw }
}
