<script setup lang="ts">
/* global HTMLElement, HTMLButtonElement */
import { nextTick, ref } from 'vue'
import type { CycleObservation as Observation, DeckCycle } from '../domain/gameReducer'

defineProps<{
  cycle: DeckCycle
  promptOpen: boolean
}>()

const emit = defineEmits<{
  answer: [observation: Observation]
  later: []
  reopen: []
}>()

const context = ref<HTMLElement>()
const firstAnswer = ref<HTMLButtonElement>()

async function answer(observation: Observation) {
  emit('answer', observation)
  await nextTick()
  context.value?.focus()
}

async function defer() {
  emit('later')
  await nextTick()
  context.value?.focus()
}

async function reopen() {
  emit('reopen')
  await nextTick()
  firstAnswer.value?.focus()
}
</script>

<template>
  <section
    class="cycle-observation forge-panel"
    aria-labelledby="cycle-observation-title"
  >
    <div
      v-if="cycle.observation"
      ref="context"
      class="cycle-observation__record"
      tabindex="-1"
      role="status"
    >
      <h2 id="cycle-observation-title">
        {{ cycle.observation === 'CONFIRMED_52' ? '已確認遊戲顯示 52 顆' : '牌池未同步' }}
      </h2>
      <p>
        {{ cycle.observation === 'CONFIRMED_52'
          ? '這次補滿情形已由你確認。'
          : '你回報遊戲沒有顯示 52 顆；目前牌池數量僅為推定。' }}
      </p>
    </div>
    <template v-else-if="promptOpen">
      <p class="cycle-observation__eyebrow">
        推定補滿，尚未確認遊戲畫面
      </p>
      <h2 id="cycle-observation-title">
        遊戲現在顯示 52 顆嗎？
      </h2>
      <p>
        系統依補滿規則推定新牌池為 52 顆；上一局結束時剩 {{ cycle.previousRemaining }} 顆。這仍待遊戲畫面確認。
      </p>
      <div class="cycle-observation__actions">
        <button
          ref="firstAnswer"
          class="cycle-observation__button cycle-observation__button--yes"
          type="button"
          data-cycle-observation="CONFIRMED_52"
          @click="answer('CONFIRMED_52')"
        >
          是，顯示 52 顆
        </button>
        <button
          class="cycle-observation__button cycle-observation__button--no"
          type="button"
          data-cycle-observation="DENIED"
          @click="answer('DENIED')"
        >
          不是
        </button>
        <button
          class="cycle-observation__button cycle-observation__button--later"
          type="button"
          data-cycle-observation="LATER"
          @click="defer"
        >
          稍後
        </button>
      </div>
    </template>
    <div
      v-else
      class="cycle-observation__record"
    >
      <div
        ref="context"
        tabindex="-1"
        role="status"
      >
        <h2 id="cycle-observation-title">
          推定補滿，尚未確認遊戲畫面
        </h2>
        <p>上一局結束時剩 {{ cycle.previousRemaining }} 顆；新週期起始 52 顆是依規則推定。</p>
      </div>
      <button
        class="cycle-observation__button cycle-observation__button--later"
        type="button"
        @click="reopen"
      >
        確認補滿情形
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cycle-observation { display: grid; gap: 12px; padding: 16px; border-color: var(--heat-good); }
.cycle-observation h2 { margin: 0; color: var(--ash); font-size: 16px; line-height: 1.45; }
.cycle-observation__eyebrow { margin: 0; color: var(--heat-good); font-size: 13px; font-weight: 650; }
.cycle-observation p { margin: 6px 0 0; color: var(--ash-muted); font-size: 14px; line-height: 1.55; }
.cycle-observation__record { display: grid; justify-items: start; gap: 10px; }
.cycle-observation__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.cycle-observation__button { min-width: 44px; min-height: 44px; padding: 9px 13px; border: 1px solid var(--edge-light); border-radius: 8px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.cycle-observation__button--yes { background: var(--heat-good); color: var(--soot); font-weight: 650; }
.cycle-observation__button:hover { filter: brightness(1.08); }
.cycle-observation__button:active { transform: translateY(1px); }
.cycle-observation__button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (max-width: 380px) { .cycle-observation__actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; } .cycle-observation__button--yes { grid-column: 1 / -1; } }
</style>
