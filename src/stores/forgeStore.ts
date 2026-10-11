import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { calculateNextDraw, RANKS, score, type Rank } from '../domain'
import { recommendWithinRound } from '../domain/recommendation'
import {
  createGameState, deriveCycleDeck, gameReducer, type CycleObservation, type GameAction,
} from '../domain/gameReducer'
import { clearPersistedGame, loadPersistedGame, savePersistedGame } from '../services/persistence'
import {
  parseGameBackup, serializeGameBackup, summarizeGameState, type ImportPreview,
} from '../services/backup'
import {
  previewHistoryCorrection as buildHistoryPreview,
  type HistoryCorrectionRequest, type HistoryEdit, type HistoryPreview,
} from '../domain/historyCorrection'

export const useForgeStore = defineStore('forge', () => {
  const loaded = loadPersistedGame()
  const game = shallowRef(loaded.ok ? loaded.state : createGameState())
  const persistenceStatus = ref<'READY' | 'ERROR'>(loaded.ok ? 'READY' : 'ERROR')
  const persistenceError = ref<string | null>(loaded.ok ? null : loaded.error)
  const rawStoredData = ref<string | null>(loaded.rawStoredData)
  let lastReadRaw = loaded.rawStoredData
  const rounds = computed(() => game.value.rounds)
  const cycles = computed(() => game.value.cycles)
  const currentCycle = computed(() => cycles.value.at(-1))
  const currentRound = computed(() => rounds.value.at(-1))
  const integrity = computed(() => game.value.syncState)
  const verifiedRemainingCount = computed(() => game.value.verifiedRemainingCount)
  const corrections = computed(() => game.value.corrections ?? [])
  const historyPreview = shallowRef<HistoryPreview | null>(null)
  let previewBase: typeof game.value | null = null
  let previewRequest: HistoryCorrectionRequest | null = null
  const backupSummary = computed(() => summarizeGameState(game.value))
  const importPreview = shallowRef<ImportPreview | null>(null)
  let importBase: typeof game.value | null = null
  let importState: typeof game.value | null = null
  const roundStatus = computed(() => currentRound.value?.status ?? null)
  const currentHand = computed<readonly Rank[]>(() => currentRound.value?.draws ?? Object.freeze([]))
  const remainingDeck = computed(() => deriveCycleDeck(game.value))
  const currentScore = computed(() => score(currentHand.value))
  const remainingTotal = computed(() => RANKS.reduce((sum, rank) => sum + remainingDeck.value[rank], 0))
  const nextDraw = computed(() => calculateNextDraw(currentHand.value, remainingDeck.value))
  const recommendation = computed(() => {
    if (persistenceStatus.value !== 'READY' || roundStatus.value !== 'ACTIVE') return null
    return recommendWithinRound(currentHand.value, remainingDeck.value, { syncState: integrity.value })
  })
  const canRecord = computed(() => persistenceStatus.value === 'READY'
    && integrity.value !== 'UNINITIALIZED' && roundStatus.value === 'ACTIVE')
  const canUndoDraw = computed(() => canRecord.value && currentHand.value.length > 0)
  const expectedRefill = computed(() => integrity.value !== 'UNINITIALIZED' && remainingTotal.value < 15)

  function dispatch(action: GameAction): boolean {
    if (persistenceStatus.value === 'ERROR') return false
    const next = gameReducer(game.value, action)
    if (next === game.value) return false
    const saved = savePersistedGame(next, lastReadRaw)
    if (!saved.ok) {
      persistenceStatus.value = 'ERROR'
      persistenceError.value = saved.error
      rawStoredData.value = saved.rawStoredData
      return false
    }
    game.value = next
    lastReadRaw = saved.rawStoredData
    rawStoredData.value = saved.rawStoredData
    return true
  }

  function retryPersistence(): boolean {
    cancelHistoryCorrection()
    cancelImport()
    const refreshed = loadPersistedGame()
    if (!refreshed.ok) {
      persistenceStatus.value = 'ERROR'
      persistenceError.value = refreshed.error
      rawStoredData.value = refreshed.rawStoredData ?? rawStoredData.value
      return false
    }
    game.value = refreshed.state
    lastReadRaw = refreshed.rawStoredData
    rawStoredData.value = refreshed.rawStoredData
    persistenceStatus.value = 'READY'
    persistenceError.value = null
    return true
  }
  function startRecording(): boolean {
    if (integrity.value !== 'UNINITIALIZED') return false
    return dispatch({
      type: 'START_ROUND', roundId: crypto.randomUUID(), cycleId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    })
  }
  function recordDraw(rank: Rank): boolean {
    if (!canRecord.value || !currentRound.value) return false
    return dispatch({ type: 'RECORD_DRAW', roundId: currentRound.value.id, rank })
  }
  function verifyRemaining(gameRemaining: number): boolean {
    return dispatch({ type: 'VERIFY_REMAINING', gameRemaining })
  }
  function exportBackup(): string | null {
    return persistenceStatus.value === 'READY' && integrity.value !== 'UNINITIALIZED'
      ? serializeGameBackup(game.value) : null
  }
  function cancelImport() {
    importPreview.value = null
    importBase = null
    importState = null
  }
  function previewImport(raw: string, fileName: string): ImportPreview {
    cancelImport()
    if (persistenceStatus.value !== 'READY') {
      importPreview.value = { ok: false, error: '請先排除本機儲存錯誤，再預覽匯入。' }
      return importPreview.value
    }
    const parsed = parseGameBackup(raw)
    if (!parsed.ok) {
      importPreview.value = parsed
      return parsed
    }
    importBase = game.value
    importState = parsed.state
    importPreview.value = {
      ok: true, current: summarizeGameState(game.value), incoming: summarizeGameState(parsed.state), fileName,
    }
    return importPreview.value
  }
  function applyImport(): boolean {
    if (!importPreview.value?.ok || !importState) return false
    if (importBase !== game.value) {
      importPreview.value = { ok: false, error: '紀錄已變更，請重新預覽備份後再匯入。' }
      importBase = null
      importState = null
      return false
    }
    if (!dispatch({ type: 'IMPORT_OVERWRITE', state: importState })) return false
    cancelImport()
    cancelHistoryCorrection()
    return true
  }
  function resetDeck(): boolean {
    if (integrity.value === 'UNINITIALIZED') return false
    if (!dispatch({
      type: 'MANUAL_RESET', roundId: crypto.randomUUID(), cycleId: crypto.randomUUID(),
      resetAt: new Date().toISOString(),
    })) return false
    cancelImport()
    cancelHistoryCorrection()
    return true
  }
  function clearLocalData(): boolean {
    if (persistenceStatus.value !== 'READY') return false
    const cleared = clearPersistedGame(lastReadRaw)
    if (!cleared.ok) {
      persistenceStatus.value = 'ERROR'
      persistenceError.value = cleared.error
      rawStoredData.value = cleared.rawStoredData
      return false
    }
    game.value = createGameState()
    lastReadRaw = null
    rawStoredData.value = null
    cancelImport()
    cancelHistoryCorrection()
    return true
  }
  function previewHistoryCorrection(edit: HistoryEdit): HistoryPreview {
    if (persistenceStatus.value !== 'READY') {
      historyPreview.value = { ok: false, error: '請先排除本機儲存錯誤，再預覽修正。' }
      return historyPreview.value
    }
    previewBase = game.value
    previewRequest = Object.freeze({
      ...edit, draws: Object.freeze([...edit.draws]),
      correctionId: crypto.randomUUID(), correctedAt: new Date().toISOString(),
    })
    historyPreview.value = buildHistoryPreview(game.value, previewRequest)
    return historyPreview.value
  }
  function cancelHistoryCorrection() {
    historyPreview.value = null
    previewBase = null
    previewRequest = null
  }
  function applyHistoryCorrection(): boolean {
    if (!historyPreview.value?.ok || !previewRequest) return false
    if (previewBase !== game.value) {
      historyPreview.value = { ok: false, error: '紀錄已變更，請重新預覽修正後再套用。' }
      previewBase = null
      previewRequest = null
      return false
    }
    if (!dispatch({ type: 'CORRECT_HISTORY', request: previewRequest })) return false
    cancelHistoryCorrection()
    return true
  }
  function undoDraw(): Rank | null {
    const rank = currentHand.value.at(-1)
    if (!canUndoDraw.value || !currentRound.value || !rank) return null
    return dispatch({ type: 'UNDO_DRAW', roundId: currentRound.value.id, rank }) ? rank : null
  }
  function finishRound(): boolean {
    if (!canRecord.value || !currentRound.value) return false
    return dispatch({
      type: 'FINISH_ROUND', roundId: currentRound.value.id, finishedAt: new Date().toISOString(),
    })
  }
  function startRound(): boolean {
    if (roundStatus.value !== 'FINISHED' || !currentCycle.value) return false
    const refill = remainingTotal.value < 15
    const cycleId = refill ? crypto.randomUUID() : currentCycle.value.id
    return dispatch({
      type: 'START_ROUND', roundId: crypto.randomUUID(), cycleId,
      startedAt: new Date().toISOString(),
      ...(refill ? { cycleCreated: {
        cycleId, reason: 'BELOW_15_NEXT_ROUND' as const, previousRemaining: remainingTotal.value,
      } } : {}),
    })
  }
  function confirmCycleObservation(observation: CycleObservation): boolean {
    if (!currentCycle.value) return false
    return dispatch({
      type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: currentCycle.value.id, observation,
      observedAt: new Date().toISOString(),
    })
  }
  return {
    persistenceStatus, persistenceError, rawStoredData, retryPersistence,
    integrity, verifiedRemainingCount, rounds, cycles, corrections, historyPreview, currentCycle, expectedRefill, roundStatus, currentHand,
    remainingDeck, currentScore, remainingTotal, nextDraw, recommendation, canRecord, canUndoDraw,
    startRecording, recordDraw, verifyRemaining, undoDraw, finishRound, startRound, confirmCycleObservation,
    previewHistoryCorrection, applyHistoryCorrection, cancelHistoryCorrection,
    backupSummary, importPreview, exportBackup, previewImport, applyImport, cancelImport, resetDeck, clearLocalData,
  }
})
