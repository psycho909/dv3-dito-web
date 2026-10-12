<script setup lang="ts">
/* global HTMLButtonElement */
import { ref } from 'vue'
import { REFILL_THRESHOLD } from '../domain/rules'
defineProps<{ remainingTotal: number }>()
const emit = defineEmits<{ open: [] }>()
const button = ref<HTMLButtonElement>()
function focus() { button.value?.focus() }
defineExpose({ focus })
</script>

<template>
  <button
    ref="button"
    class="deck-status"
    type="button"
    :aria-label="`剩餘牌池 ${remainingTotal} / 52${remainingTotal === REFILL_THRESHOLD ? `，剩 ${REFILL_THRESHOLD}，下局預計補滿` : ''}`"
    :title="remainingTotal === REFILL_THRESHOLD ? `剩 ${REFILL_THRESHOLD}，下局預計補滿；開啟牌池明細` : '開啟牌池明細'"
    aria-haspopup="dialog"
    @click="emit('open')"
  >
    剩 {{ remainingTotal }} / 52
  </button>
</template>

<style scoped lang="scss">
.deck-status { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 6px 4px; border: 0; background: transparent; color: var(--ash); font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; cursor: pointer; }
.deck-status:focus-visible { outline: 2px solid var(--heat-perfect); outline-offset: 2px; }
.deck-status:hover { color: var(--focus); }
</style>
