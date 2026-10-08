<script setup lang="ts">
import { RANKS, type Deck, type Rank } from '../domain'

defineProps<{
  integrity: 'UNINITIALIZED' | 'SYNCED'
  remainingDeck: Deck
  canRecord: boolean
}>()

const emit = defineEmits<{
  select: [rank: Rank]
}>()

type RankButton = { focus: () => void; disabled: boolean }
const rankButtons = new Map<Rank, RankButton>()

function focusFirstKey() {
  const firstEnabledRank = RANKS.find((rank) => !rankButtons.get(rank)?.disabled)
  if (firstEnabledRank) rankButtons.get(firstEnabledRank)?.focus()
}

function setRankButton(rank: Rank, element: unknown) {
  if (typeof element === 'object' && element !== null && 'focus' in element && 'disabled' in element) {
    rankButtons.set(rank, element as RankButton)
  } else {
    rankButtons.delete(rank)
  }
}

defineExpose({ focusFirstKey })
</script>

<template>
  <section
    class="keypad forge-panel"
    aria-labelledby="keypad-title"
  >
    <div>
      <h2 id="keypad-title">
        記錄遊戲剛抽到的石頭
      </h2>
      <p class="keypad__hint">
        點數只會記錄你在遊戲中已抽出的石頭。
      </p>
    </div>
    <div class="keypad__grid">
      <button
        v-for="rank in RANKS"
        :key="rank"
        :ref="(element) => setRankButton(rank, element)"
        class="keypad__key"
        :data-rank-key="rank"
        type="button"
        :disabled="integrity !== 'SYNCED' || !canRecord || remainingDeck[rank] === 0"
        :aria-label="`${rank} 點，${integrity === 'SYNCED' ? `剩 ${remainingDeck[rank]}` : '剩餘數未確認'}`"
        @click="canRecord && emit('select', rank)"
      >
        <span class="keypad__rank">{{ rank }}</span>
        <span class="keypad__remaining">{{ integrity === 'SYNCED' ? `剩 ${remainingDeck[rank]}` : '剩 —' }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.keypad { padding: 20px; }
h2 { margin: 0; color: var(--ash); font-size: 18px; }
.keypad__hint { margin: 6px 0 0; color: var(--ash-muted); font-size: 14px; }
.keypad__grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
.keypad__key { display: grid; align-content: center; justify-items: center; gap: 4px; min-width: 0; min-height: 60px; padding: 6px 2px; border: 1px solid var(--seam); border-radius: 10px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.keypad__rank { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.keypad__remaining { color: var(--ash-muted); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.keypad__key:hover:not(:disabled) { border-color: var(--edge-light); background: var(--seam); }
.keypad__key:active:not(:disabled) { background: var(--seam); }
.keypad__key:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.keypad__key:disabled { border-style: dashed; background: var(--anvil); color: var(--ash-muted); cursor: not-allowed; }
@media (max-width: 360px) { .keypad { padding: 12px; } .keypad__grid { gap: 5px; } }
</style>
