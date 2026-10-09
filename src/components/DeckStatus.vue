<script setup lang="ts">
/* global HTMLButtonElement */
import { ref } from 'vue'
defineProps<{ remainingTotal: number }>()
const emit = defineEmits<{ open: [] }>()
const button = ref<HTMLButtonElement>()
function focus() { button.value?.focus() }
defineExpose({ focus })
</script>

<template>
  <button
    ref="button"
    class="deck-status forge-panel"
    type="button"
    :aria-label="`剩餘牌池 ${remainingTotal} / 52${remainingTotal === 15 ? '，剩 15，尚未達補滿條件' : ''}`"
    aria-haspopup="dialog"
    @click="emit('open')"
  >
    <span aria-hidden="true">▦</span>
    <span class="deck-status__text">
      <span>剩餘 {{ remainingTotal }} / 52</span>
      <span
        v-if="remainingTotal === 15"
        class="deck-status__threshold"
      >剩 15，尚未達補滿條件</span>
    </span>
    <span class="deck-status__hint">查看牌池</span>
  </button>
</template>

<style scoped lang="scss">
.deck-status { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; max-width: 100%; padding: 8px 12px; color: var(--ash); text-align: left; cursor: pointer; }
.deck-status__text { display: grid; gap: 2px; min-width: 0; }
.deck-status__threshold { color: var(--ash-muted); font-size: 12px; }
.deck-status:focus-visible { outline: 2px solid var(--heat-perfect); outline-offset: 2px; }
.deck-status__hint { color: var(--ash-muted); font-size: 12px; }
</style>
