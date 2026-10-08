<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import DeckIntegrityStatus from './components/DeckIntegrityStatus.vue'
import HandSummary from './components/HandSummary.vue'
import ProbabilityBreakdown from './components/ProbabilityBreakdown.vue'
import RankKeypad from './components/RankKeypad.vue'
import RoundActions from './components/RoundActions.vue'
import { formatTierPercentages, type Rank } from './domain'
import { useForgeStore } from './stores/forgeStore'

const store = useForgeStore()
const keypad = ref<InstanceType<typeof RankKeypad>>()
const roundActions = ref<InstanceType<typeof RoundActions>>()
const finishDialogOpen = ref(false)
const roundAnnouncement = ref('')
const calculableDraw = computed(() => {
  const result = store.nextDraw
  return store.integrity === 'SYNCED' && result.isComputable ? result : null
})
const tierPercentages = computed(() => {
  const result = calculableDraw.value
  if (!result) return []
  return formatTierPercentages(
    result.tierOutcomes.map(({ matchingCount }) => matchingCount),
    result.remainingTotal,
  )
})

async function confirmRecording() {
  if (!store.startRecording()) return
  await nextTick()
  keypad.value?.focusFirstKey()
}

function recordDraw(rank: Rank) {
  if (!store.canRecord) return
  if (store.recordDraw(rank)) roundAnnouncement.value = ''
}

async function undoDraw() {
  const rank = store.undoDraw()
  if (rank === null) return
  const message = `已撤銷：${rank}，牌池已還原。`
  if (roundAnnouncement.value === message) {
    roundAnnouncement.value = ''
    await nextTick()
  }
  roundAnnouncement.value = message
  if (!store.canUndoDraw) {
    await nextTick()
    keypad.value?.focusFirstKey()
  }
}

async function finishRound() {
  if (!store.finishRound()) return
  finishDialogOpen.value = false
  await nextTick()
  roundActions.value?.focusStartRound()
}

async function startRound() {
  if (!store.startRound()) return
  finishDialogOpen.value = false
  roundAnnouncement.value = ''
  await nextTick()
  keypad.value?.focusFirstKey()
}
</script>

<template>
  <main class="forge-app">
    <header class="forge-app__header">
      <div>
        <p class="forge-app__eyebrow">
          手動記牌・即時計算
        </p>
        <h1>迪特的鐵匠鋪機率計算器</h1>
      </div>
      <DeckIntegrityStatus
        :integrity="store.integrity"
        @confirm="confirmRecording"
      />
    </header>

    <div
      class="forge-app__workspace"
      :class="{ 'forge-app__workspace--active': store.integrity === 'SYNCED' }"
    >
      <HandSummary
        v-if="store.integrity === 'SYNCED'"
        class="forge-app__summary"
        :current-hand="store.currentHand"
        :current-score="store.currentScore"
      />

      <ProbabilityBreakdown
        v-if="store.roundStatus === 'ACTIVE' && calculableDraw"
        class="forge-app__probability"
        :outcomes="calculableDraw.tierOutcomes"
        :percentages="tierPercentages"
        :remaining-total="calculableDraw.remainingTotal"
        :safe-probability="calculableDraw.safeProbability"
        :burst-probability="calculableDraw.burstProbability"
      />
      <section
        v-else-if="store.integrity === 'SYNCED' && store.roundStatus === 'ACTIVE'"
        class="empty-deck forge-panel forge-app__probability"
        aria-live="polite"
      >
        <h2>目前沒有可抽取的石頭</h2>
        <p>牌池剩餘 0 顆，沒有下一顆機率可供計算。</p>
      </section>
      <section
        v-else-if="store.roundStatus === 'FINISHED'"
        class="round-finished forge-panel forge-app__probability"
        aria-labelledby="round-finished-title"
      >
        <h2 id="round-finished-title">
          本局已完成
        </h2>
        <p>上方保留本局最終手牌與分數；牌池保留在剩 {{ store.remainingTotal }} 顆，沒有抽取額外石頭。</p>
        <p>下一顆機率只會在開始新局後顯示。</p>
      </section>

      <RankKeypad
        ref="keypad"
        class="forge-app__keypad"
        :integrity="store.integrity"
        :remaining-deck="store.remainingDeck"
        :can-record="store.canRecord"
        @select="recordDraw"
      />
      <RoundActions
        v-if="store.roundStatus"
        ref="roundActions"
        class="forge-app__round-actions"
        :round-status="store.roundStatus"
        :can-undo-draw="store.canUndoDraw"
        :announcement="roundAnnouncement"
        @undo="undoDraw"
        @finish="finishDialogOpen = true"
        @start="startRound"
      />
    </div>

    <footer class="forge-app__footer">
      目前僅暫存在本頁；重新整理會清除記錄。持久化尚未實作。
    </footer>

    <ConfirmDialog
      id="finish-round"
      v-model:open="finishDialogOpen"
      title="完成本局？"
      description="完成後會保留本局手牌與最終分數，牌池不變，也不會抽取額外石頭。完成本局無法撤銷；歷史修正功能尚未提供。"
      confirm-label="完成本局"
      @confirm="finishRound"
    />
  </main>
</template>

<style scoped lang="scss">
.forge-app {
  display: grid;
  gap: 24px;
  width: min(100%, 1200px);
  margin: 0 auto;
}

.forge-app__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
  align-items: start;
  gap: 24px;
}

.forge-app__eyebrow {
  margin: 0 0 8px;
  color: var(--ash-muted);
  font-size: 14px;
}

h1 {
  margin: 0;
  color: var(--ash);
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.25;
}

.forge-app__workspace {
  display: grid;
  grid-template-areas: 'keypad';
  gap: 16px;
}

.forge-app__summary { grid-area: summary; }
.forge-app__probability { grid-area: probability; }
.forge-app__keypad { grid-area: keypad; }
.forge-app__round-actions { grid-area: round-actions; }

.forge-app__workspace--active {
  grid-template-areas:
    'summary summary'
    'probability probability'
    'keypad keypad'
    'round-actions round-actions';
}

.empty-deck {
  padding: 20px;
}

.empty-deck h2 { margin: 0 0 8px; color: var(--ash); font-size: 18px; }
.empty-deck p { margin: 0; color: var(--ash-muted); }

.round-finished { display: grid; align-content: start; gap: 12px; padding: 20px; }
.round-finished h2 { margin: 0; color: var(--ash); font-size: 18px; }
.round-finished p { margin: 0; color: var(--ash-muted); line-height: 1.6; }

.forge-app__footer {
  padding-top: 16px;
  border-top: 1px solid var(--seam);
  color: var(--ash-muted);
  font-size: 13px;
  line-height: 1.5;
}

@media (min-width: 768px) and (max-width: 1023px) {
  .forge-app__header { grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); }
  .forge-app__workspace--active {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'summary summary'
      'keypad probability'
      'round-actions probability';
    align-items: start;
  }
}

@media (min-width: 1024px) {
  .forge-app__header { align-items: center; }
  .forge-app__workspace--active {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    grid-template-areas:
      'summary probability'
      'keypad probability'
      'round-actions probability';
    align-items: start;
  }
}

@media (max-width: 767px) {
  .forge-app { gap: 16px; }
  .forge-app__header { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .forge-app__workspace { gap: 12px; }
}
</style>
