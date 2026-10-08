import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { calculateNextDraw, deriveRemainingDeck, RANKS, score, type Rank } from '../domain'
import { createGameState, gameReducer, type GameAction } from '../domain/gameReducer'

export const useForgeStore = defineStore('forge', () => {
  const game = shallowRef(createGameState())
  const rounds = computed(() => game.value.rounds)
  const currentRound = computed(() => rounds.value.at(-1))
  const integrity = computed(() => rounds.value.length === 0 ? 'UNINITIALIZED' : 'SYNCED')
  const roundStatus = computed(() => currentRound.value?.status ?? null)
  const currentHand = computed<readonly Rank[]>(() => currentRound.value?.draws ?? Object.freeze([]))
  const consumed = computed(() => rounds.value.flatMap((round) => round.draws))
  const remainingDeck = computed(() => Object.freeze(deriveRemainingDeck(consumed.value)))
  const currentScore = computed(() => score(currentHand.value))
  const remainingTotal = computed(() => RANKS.reduce((sum, rank) => sum + remainingDeck.value[rank], 0))
  const nextDraw = computed(() => calculateNextDraw(currentHand.value, remainingDeck.value))
  const canRecord = computed(() => integrity.value === 'SYNCED' && roundStatus.value === 'ACTIVE')
  const canUndoDraw = computed(() => canRecord.value && currentHand.value.length > 0)

  function dispatch(action: GameAction): boolean {
    const next = gameReducer(game.value, action)
    if (next === game.value) return false
    game.value = next
    return true
  }
  function startRecording(): boolean {
    if (integrity.value === 'SYNCED') return false
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
    if (roundStatus.value !== 'FINISHED' || !currentRound.value) return false
    return dispatch({
      type: 'START_ROUND', roundId: crypto.randomUUID(), cycleId: currentRound.value.cycleId,
      startedAt: new Date().toISOString(),
    })
  }
  return {
    integrity, rounds, roundStatus, currentHand, remainingDeck, currentScore, remainingTotal,
    nextDraw, canRecord, canUndoDraw, startRecording, recordDraw, undoDraw, finishRound, startRound,
  }
})
