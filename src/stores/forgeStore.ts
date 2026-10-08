import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { calculateNextDraw, deriveRemainingDeck, RANKS, score, type Rank } from '../domain'

export const useForgeStore = defineStore('forge', () => {
  const integrity = ref<'UNINITIALIZED' | 'SYNCED'>('UNINITIALIZED')
  const draws = ref<Rank[]>([])
  const currentHand = computed<readonly Rank[]>(() => Object.freeze([...draws.value]))
  const remainingDeck = computed(() => deriveRemainingDeck(draws.value))
  const currentScore = computed(() => score(draws.value))
  const remainingTotal = computed(() => RANKS.reduce((sum, rank) => sum + remainingDeck.value[rank], 0))
  const nextDraw = computed(() => calculateNextDraw(draws.value, remainingDeck.value))
  function startRecording(): boolean {
    if (integrity.value === 'SYNCED') return false
    integrity.value = 'SYNCED'
    return true
  }
  function recordDraw(rank: Rank): boolean {
    if (integrity.value !== 'SYNCED' || !RANKS.includes(rank) || remainingDeck.value[rank] === 0) return false
    draws.value.push(rank)
    return true
  }
  return { integrity, currentHand, remainingDeck, currentScore, remainingTotal, nextDraw, startRecording, recordDraw }
})
