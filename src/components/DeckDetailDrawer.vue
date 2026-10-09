<script setup lang="ts">
/* global Event, HTMLDialogElement, HTMLButtonElement */
import { nextTick, ref, watch } from 'vue'
import type { Deck, Rank } from '../domain'

const props = defineProps<{
  open: boolean
  remainingDeck: Deck
  remainingTotal: number
}>()

const emit = defineEmits<{ close: [] }>()
const ranks: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']
const dialog = ref<HTMLDialogElement>()
const closeButton = ref<HTMLButtonElement>()

function cancel(event: Event) {
  event.preventDefault()
  dialog.value?.close()
  emit('close')
}

watch(() => props.open, (open) => {
  void nextTick(() => {
    const element = dialog.value
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      closeButton.value?.focus()
    } else if (!open && element.open) element.close()
  })
}, { flush: 'post' })

function close() {
  dialog.value?.close()
  emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="deck-drawer forge-panel"
    aria-labelledby="deck-drawer-title"
    @cancel="cancel"
  >
    <header class="deck-drawer__header">
      <div>
        <p class="deck-drawer__eyebrow">
          剩餘牌池
        </p>
        <h2 id="deck-drawer-title">
          剩餘牌池明細
        </h2>
      </div>
      <button
        ref="closeButton"
        class="deck-drawer__close"
        type="button"
        aria-label="關閉牌池明細"
        @click="close"
      >
        關閉
      </button>
    </header>
    <p class="deck-drawer__total">
      剩餘 <strong>{{ remainingTotal }} / 52</strong>
    </p>
    <p class="deck-drawer__explanation">
      各點數數量依你手動記錄推算，不會從遊戲自動讀取。
    </p>
    <ul class="deck-drawer__ranks">
      <li
        v-for="rank in ranks"
        :key="rank"
        :data-deck-rank="rank"
      >
        <span>{{ rank }}</span><strong>剩 {{ remainingDeck[rank] }}</strong>
      </li>
    </ul>
  </dialog>
</template>

<style scoped lang="scss">
.deck-drawer { position: fixed; inset: 0 0 0 auto; width: min(100%, 420px); max-width: none; height: 100dvh; max-height: none; margin: 0 0 0 auto; overflow-y: auto; padding: 20px; border-radius: 8px 0 0 8px; }
.deck-drawer::backdrop { background: rgb(0 0 0 / 55%); }
.deck-drawer__header { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.deck-drawer__eyebrow { margin: 0 0 4px; color: var(--ash-muted); font-size: 13px; }
.deck-drawer h2 { margin: 0; color: var(--ash); font-size: 20px; }
.deck-drawer__close { min-height: 44px; padding: 8px 12px; border: 1px solid var(--seam); border-radius: 5px; background: var(--anvil-raised); color: var(--ash); cursor: pointer; }
.deck-drawer__close:focus-visible { outline: 2px solid var(--heat-perfect); outline-offset: 2px; }
.deck-drawer__total { margin: 20px 0 6px; color: var(--ash-muted); }
.deck-drawer__total strong { color: var(--ash); font-variant-numeric: tabular-nums; }
.deck-drawer__explanation { margin: 0 0 16px; color: var(--ash-muted); font-size: 14px; line-height: 1.5; }
.deck-drawer__ranks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.deck-drawer__ranks li { display: flex; justify-content: space-between; gap: 8px; min-width: 0; padding: 12px; border: 1px solid var(--seam); border-radius: 5px; color: var(--ash); }
.deck-drawer__ranks strong { font-variant-numeric: tabular-nums; }
@media (max-width: 359px) { .deck-drawer { padding: 16px; } .deck-drawer__ranks { grid-template-columns: 1fr; } }
</style>
