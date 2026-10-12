<script setup lang="ts">
/* global HTMLButtonElement */
import { ref } from 'vue'

defineProps<{
  roundStatus: 'UNINITIALIZED' | 'ACTIVE' | 'FINISHED'
  canUndoDraw: boolean
  announcement: string
}>()

const startButton = ref<HTMLButtonElement>()
const finishButton = ref<HTMLButtonElement>()

const emit = defineEmits<{
  undo: []
  finish: []
  start: []
}>()

function focusStartRound() {
  startButton.value?.focus()
}

function focusFinishRound() {
  finishButton.value?.focus()
}

defineExpose({ focusStartRound, focusFinishRound })

</script>

<template>
  <section
    class="round-actions"
    aria-label="本局操作"
  >
    <div
      v-if="roundStatus === 'ACTIVE'"
      class="round-actions__buttons"
    >
      <button
        class="round-actions__button round-actions__button--secondary"
        type="button"
        aria-label="撤銷輸入"
        :disabled="!canUndoDraw"
        @click="emit('undo')"
      >
        撤銷輸入
      </button>
      <button
        ref="finishButton"
        class="round-actions__button"
        type="button"
        aria-label="完成本局"
        @click="emit('finish')"
      >
        完成本局
      </button>
    </div>
    <div
      v-else-if="roundStatus === 'FINISHED'"
      class="round-actions__buttons"
    >
      <p class="round-actions__finished sr-only">
        本局已完成，手牌與最終分數已保留。
      </p>
      <button
        ref="startButton"
        class="round-actions__button"
        type="button"
        aria-label="開始新局"
        @click="emit('start')"
      >
        開始新局
      </button>
    </div>
    <div
      v-else
      class="round-actions__buttons round-actions__buttons--empty"
    >
      開始記錄後可撤銷輸入或完成本局
    </div>
    <p
      class="round-actions__announcement"
      data-testid="round-announcement"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ announcement }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.round-actions { display: grid; align-content: start; gap: 8px; min-width: 0; }
.round-actions__buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-height: 44px; }
.round-actions__buttons--empty { color: var(--ash-muted); font-size: 13px; }
.round-actions__button { min-width: 44px; min-height: 44px; padding: 8px 14px; border: 1px solid var(--control-edge); border-radius: 8px; background: var(--ash); color: var(--soot); font: inherit; font-weight: 650; cursor: pointer; }
.round-actions__button--secondary { border-color: var(--control-edge); background: var(--anvil-raised); color: var(--ash); }
.round-actions__button:hover:not(:disabled) { filter: brightness(1.08); }
.round-actions__button:active:not(:disabled) { transform: translateY(1px); }
.round-actions__button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.round-actions__button:disabled { color: var(--ash-muted); cursor: not-allowed; }
.round-actions__finished { flex: 1 1 240px; margin: 0; color: var(--ash-muted); line-height: 1.5; }
.round-actions__announcement { min-height: 1.5em; margin: 0; color: var(--ash-muted); font-size: 14px; line-height: 1.5; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (max-width: 360px) { .round-actions__buttons { align-items: stretch; } .round-actions__button { flex: 1 1 120px; } }
</style>
