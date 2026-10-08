import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { calculateNextDraw, RANKS, score, type Rank } from '../domain'
import {
  createGameState, deriveCycleDeck, gameReducer, type CycleObservation, type GameAction,
} from '../domain/gameReducer'

export const useForgeStore = defineStore('forge', () => {
  const game = shallowRef(createGameState())
  const rounds = computed(() => game.value.rounds)
  const cycles = computed(() => game.value.cycles)
  const currentCycle = computed(() => cycles.value.at(-1))
  const currentRound = computed(() => rounds.value.at(-1))
  const integrity = computed(() => game.value.syncState)
  const roundStatus = computed(() => currentRound.value?.status ?? null)
  const currentHand = computed<readonly Rank[]>(() => currentRound.value?.draws ?? Object.freeze([]))
  const remainingDeck = computed(() => deriveCycleDeck(game.value))
  const currentScore = computed(() => score(currentHand.value))
  const remainingTotal = computed(() => RANKS.reduce((sum, rank) => sum + remainingDeck.value[rank], 0))
  const nextDraw = computed(() => calculateNextDraw(currentHand.value, remainingDeck.value))
  const canRecord = computed(() => integrity.value !== 'UNINITIALIZED' && roundStatus.value === 'ACTIVE')
  const canUndoDraw = computed(() => canRecord.value && currentHand.value.length > 0)
  const expectedRefill = computed(() => integrity.value !== 'UNINITIALIZED' && remainingTotal.value < 15)

  function dispatch(action: GameAction): boolean {
    const next = gameReducer(game.value, action)
    if (next === game.value) return false
    game.value = next
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
    integrity, rounds, cycles, currentCycle, expectedRefill, roundStatus, currentHand,
    remainingDeck, currentScore, remainingTotal, nextDraw, canRecord, canUndoDraw,
    startRecording, recordDraw, undoDraw, finishRound, startRound, confirmCycleObservation,
  }
})
