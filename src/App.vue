<script setup lang="ts">
/* global document, HTMLButtonElement, Blob, URL, setTimeout */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import CloudBackupStatus from './components/CloudBackupStatus.vue'
import GitHubAuthPanel from './components/GitHubAuthPanel.vue'
import LocalPersistenceStatus from './components/LocalPersistenceStatus.vue'
import CycleObservation from './components/CycleObservation.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import DeckIntegrityStatus from './components/DeckIntegrityStatus.vue'
import HandSummary from './components/HandSummary.vue'
import ProbabilityBreakdown from './components/ProbabilityBreakdown.vue'
import RecommendationHint from './components/RecommendationHint.vue'
import RankOutcomeDetail from './components/RankOutcomeDetail.vue'
import DeckStatus from './components/DeckStatus.vue'
import DeckDetailDrawer from './components/DeckDetailDrawer.vue'
import RankKeypad from './components/RankKeypad.vue'
import RoundActions from './components/RoundActions.vue'
import RemainingVerification from './components/RemainingVerification.vue'
import HistoryDrawer from './components/HistoryDrawer.vue'
import DataManagementPanel from './components/DataManagementPanel.vue'
import type { HistoryEdit } from './domain/historyCorrection'
import { classify, formatTierPercentages, type Rank } from './domain'
import { TIER_SCORES } from './domain/rules'
import { useForgeStore } from './stores/forgeStore'

const store = useForgeStore()
const keypad = ref<InstanceType<typeof RankKeypad>>()
const roundActions = ref<InstanceType<typeof RoundActions>>()
const recovery = ref<InstanceType<typeof LocalPersistenceStatus>>()
const persistenceFailed = computed(() => store.persistenceStatus === 'ERROR')
const finishDialogOpen = ref(false)
const deckDrawerOpen = ref(false)
const deckStatus = ref<InstanceType<typeof DeckStatus>>()
const historyDrawerOpen = ref(false)
const historyButton = ref<HTMLButtonElement>()
const historyNotice = ref('')
const dataNotice = ref('')
const roundAnnouncement = ref('')
const openObservationCycleId = ref<string | null>(null)
const cyclePromptOpen = computed(() => {
  const cycle = store.currentCycle
  return cycle?.reason === 'BELOW_15_NEXT_ROUND'
    && !cycle.observation
    && openObservationCycleId.value === cycle.id
})
const cycleUnverified = computed(() => store.currentCycle?.reason === 'BELOW_15_NEXT_ROUND'
  && !store.currentCycle.observation)
const calculableDraw = computed(() => {
  const result = store.nextDraw
  return store.integrity === 'SYNCED' && result.isComputable ? result : null
})

async function focusRecovery() {
  if (!persistenceFailed.value) return
  const waitForHistoryClose = historyDrawerOpen.value
  finishDialogOpen.value = false
  deckDrawerOpen.value = false
  historyDrawerOpen.value = false
  await nextTick()
  if (waitForHistoryClose) await nextTick()
  recovery.value?.focusError()
}
watch(persistenceFailed, focusRecovery)
onMounted(focusRecovery)

async function retryPersistence() {
  if (!store.retryPersistence()) {
    await focusRecovery()
    return
  }
  openObservationCycleId.value = null
  roundAnnouncement.value = ''
  await nextTick()
  if (store.roundStatus === 'FINISHED') roundActions.value?.focusStartRound()
  else if (store.roundStatus === 'ACTIVE' && store.remainingTotal === 0) roundActions.value?.focusFinishRound()
  else if (store.roundStatus === 'ACTIVE') keypad.value?.focusFirstKey()
  else document.querySelector<HTMLButtonElement>('.integrity button')?.focus()
}
const tierPercentages = computed(() => {
  const result = calculableDraw.value
  if (!result) return []
  return formatTierPercentages(
    result.tierOutcomes.map(({ matchingCount }) => matchingCount),
    result.remainingTotal,
  )
})
const finishedTier = computed(() => classify(store.currentScore))
const finishedTierScoreText = computed(() => {
  const result = TIER_SCORES[finishedTier.value]
  return result.status === 'CONFIRMED' ? `得分 ${result.points} 分` : '得分未確認'
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

function verifyRemaining(remaining: number) {
  store.verifyRemaining(remaining)
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
  const previousCycleId = store.currentCycle?.id
  if (!store.startRound()) return
  const cycle = store.currentCycle
  if (cycle?.reason === 'BELOW_15_NEXT_ROUND' && cycle.id !== previousCycleId) {
    openObservationCycleId.value = cycle.id
  }
  finishDialogOpen.value = false
  roundAnnouncement.value = ''
  await nextTick()
  keypad.value?.focusFirstKey()
}

function observeCycle(observation: 'CONFIRMED_52' | 'DENIED') {
  if (store.confirmCycleObservation(observation)) openObservationCycleId.value = null
}

function deferCycleObservation() {
  openObservationCycleId.value = null
}

function closeDeckDrawer() {
  deckDrawerOpen.value = false
  void nextTick(() => deckStatus.value?.focus())
}

function openHistory() {
  store.cancelHistoryCorrection()
  historyNotice.value = ''
  historyDrawerOpen.value = true
}

function closeHistory() {
  historyDrawerOpen.value = false
  store.cancelHistoryCorrection()
  void nextTick(() => historyButton.value?.focus())
}

function previewHistory(edit: HistoryEdit) {
  historyNotice.value = ''
  store.previewHistoryCorrection(edit)
}

function applyHistory() {
  if (!store.applyHistoryCorrection()) return
  historyNotice.value = '已套用修正，所有回合與牌池已重新推算。'
  roundAnnouncement.value = historyNotice.value
  openObservationCycleId.value = cycleUnverified.value ? store.currentCycle?.id ?? null : null
}

function exportBackup() {
  const raw = store.exportBackup()
  if (raw === null) return
  let url: string | undefined
  try {
    url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `dito-forge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.append(link)
    link.click()
    link.remove()
    dataNotice.value = '已準備 JSON 備份下載，請確認檔案已保存。'
  } catch {
    dataNotice.value = '無法準備備份下載，紀錄仍保留。請稍後再試。'
  } finally {
    if (url) {
      const objectUrl = url
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    }
  }
}

function previewImport(raw: string, fileName: string) {
  dataNotice.value = ''
  store.previewImport(raw, fileName)
}

function announceDataChange(message: string) {
  dataNotice.value = message
  roundAnnouncement.value = ''
  openObservationCycleId.value = cycleUnverified.value ? store.currentCycle?.id ?? null : null
}

function applyImport() {
  if (store.applyImport()) announceDataChange('已匯入備份並覆蓋本機紀錄。')
}

function resetDeck() {
  if (store.resetDeck()) announceDataChange('已重置為完整 52 顆牌池，舊局與修正紀錄已保留。')
}

function clearLocalData() {
  if (store.clearLocalData()) announceDataChange('已清除此裝置的記牌紀錄，尚未開始新的記錄。')
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
        v-if="!persistenceFailed"
        :integrity="store.integrity"
        :expected-refill="store.expectedRefill"
        :cycle-unverified="cycleUnverified"
        @confirm="confirmRecording"
      />
    </header>

    <CloudBackupStatus />
    <GitHubAuthPanel />
    <div
      v-if="!persistenceFailed && store.integrity !== 'UNINITIALIZED'"
      class="forge-app__history-access"
    >
      <button
        ref="historyButton"
        type="button"
        data-history-open
        aria-haspopup="dialog"
        @click="openHistory"
      >
        查看歷史與修正
      </button>
    </div>
    <LocalPersistenceStatus
      v-if="persistenceFailed"
      ref="recovery"
      :error="store.persistenceError ?? '無法安全讀取或儲存本機紀錄。'"
      :raw-data="store.rawStoredData"
      @retry="retryPersistence"
    />

    <CycleObservation
      v-if="!persistenceFailed && store.currentCycle?.reason === 'BELOW_15_NEXT_ROUND'"
      :key="store.currentCycle.id"
      :cycle="store.currentCycle"
      :prompt-open="cyclePromptOpen"
      @answer="observeCycle"
      @later="deferCycleObservation"
      @reopen="openObservationCycleId = store.currentCycle?.id ?? null"
    />

    <div
      v-if="!persistenceFailed"
      class="forge-app__workspace"
      :class="{ 'forge-app__workspace--active': store.integrity !== 'UNINITIALIZED' }"
    >
      <HandSummary
        v-if="store.integrity !== 'UNINITIALIZED'"
        class="forge-app__summary"
        :current-hand="store.currentHand"
        :current-score="store.currentScore"
      />

      <div
        v-if="store.integrity !== 'UNINITIALIZED'"
        class="forge-app__results"
      >
        <section
          v-if="store.integrity === 'UNSYNCED'"
          class="unsynced-guidance forge-panel"
          aria-live="polite"
        >
          <h2>目前不能保證精確機率</h2>
          <p>仍可繼續記錄與撤銷。要恢復同步，請依序處理：</p>
          <ol>
            <li>若漏記了已抽出的石頭，按下對應點數補記。</li>
            <li>若最近一次記錄錯誤，使用「撤銷輸入」移除該筆。</li>
            <li>修復後重新核對遊戲當下剩餘顆數；舊目標相符不會自動恢復。</li>
            <li>等待遊戲依規則重新補滿 52 顆，再於新週期回答既有的補滿確認。</li>
          </ol>
          <p>舊局記錯可從「查看歷史與修正」編輯並預覽，也可從「備份與資料管理」匯入有效備份。請只補記你知道點數的遺漏石頭；不知道點數時，等待遊戲重新補滿並確認新週期。</p>
        </section>
        <ProbabilityBreakdown
          v-if="store.roundStatus === 'ACTIVE' && calculableDraw"
          class="forge-app__probability"
          :outcomes="calculableDraw.tierOutcomes"
          :percentages="tierPercentages"
          :remaining-total="calculableDraw.remainingTotal"
          :safe-probability="calculableDraw.safeProbability"
          :burst-probability="calculableDraw.burstProbability"
          :estimated="cycleUnverified"
        />
        <RankOutcomeDetail
          v-if="store.roundStatus === 'ACTIVE' && calculableDraw"
          :outcomes="calculableDraw.rankOutcomes"
          :remaining-total="calculableDraw.remainingTotal"
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
          <p
            class="round-finished__result"
            data-testid="round-finished-result"
          >
            本局等級：{{ finishedTier }} · {{ finishedTierScoreText }}
          </p>
          <p v-if="store.integrity === 'UNSYNCED'">
            上方保留本局最終手牌與分數；依手動記錄推算剩 {{ store.remainingTotal }} 顆，不代表遊戲實際庫存。
          </p>
          <p v-else>
            上方保留本局最終手牌與分數；牌池保留在剩 {{ store.remainingTotal }} 顆，沒有抽取額外石頭。
          </p>
          <p>下一顆機率只會在開始新局後顯示。</p>
        </section>
        <RemainingVerification
          :verified-remaining-count="store.verifiedRemainingCount ?? null"
          :tool-remaining="store.remainingTotal"
          :integrity="store.integrity"
          @verify="verifyRemaining"
        />
        <RecommendationHint
          v-if="store.integrity === 'SYNCED' && store.roundStatus === 'ACTIVE' && store.recommendation"
          :recommendation="store.recommendation"
          :current-score="store.currentScore"
          :estimated="cycleUnverified"
        />
        <DeckStatus
          ref="deckStatus"
          :remaining-total="store.remainingTotal"
          @open="deckDrawerOpen = true"
        />
      </div>

      <RankKeypad
        ref="keypad"
        class="forge-app__keypad"
        :integrity="store.integrity"
        :stock-is-estimated="cycleUnverified"
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

    <DataManagementPanel
      v-if="!persistenceFailed"
      :disabled="persistenceFailed"
      :initialized="store.integrity !== 'UNINITIALIZED'"
      :current-summary="store.backupSummary"
      :import-preview="store.importPreview"
      :notice="dataNotice"
      @export="exportBackup"
      @preview-import="previewImport"
      @apply-import="applyImport"
      @cancel-import="store.cancelImport"
      @reset-deck="resetDeck"
      @clear-local="clearLocalData"
    />

    <footer class="forge-app__footer">
      <template v-if="!persistenceFailed">
        合法操作會保存於此瀏覽器；重新整理可恢復紀錄。清除瀏覽器資料會失去本機紀錄。
      </template>
      <template v-else>
        本機資料尚未恢復，遊戲操作已暫停。
      </template>
    </footer>

    <ConfirmDialog
      id="finish-round"
      v-model:open="finishDialogOpen"
      title="完成本局？"
      description="完成後會保留本局手牌與最終分數，牌池不變，也不會抽取額外石頭。完成本局無法撤銷；記錯的點數可從歷史預覽修正。"
      confirm-label="完成本局"
      @confirm="finishRound"
    />
    <DeckDetailDrawer
      :open="deckDrawerOpen"
      :remaining-deck="store.remainingDeck"
      :remaining-total="store.remainingTotal"
      @close="closeDeckDrawer"
    />
    <HistoryDrawer
      :open="historyDrawerOpen"
      :rounds="store.rounds"
      :cycles="store.cycles"
      :corrections="store.corrections"
      :preview="store.historyPreview"
      :notice="historyNotice"
      @close="closeHistory"
      @preview="previewHistory"
      @apply="applyHistory"
      @cancel-preview="store.cancelHistoryCorrection"
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

.forge-app__history-access { display: flex; justify-content: flex-end; }
.forge-app__history-access button { min-height: 44px; padding: 10px 14px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil); color: var(--ash); font: inherit; cursor: pointer; }
.forge-app__history-access button:hover { background: var(--anvil-raised); }
.forge-app__history-access button:active { transform: translateY(1px); }
.forge-app__history-access button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

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
.forge-app__results { grid-area: probability; display: grid; align-content: start; gap: 12px; min-width: 0; }
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

.unsynced-guidance { display: grid; gap: 8px; padding: 16px; border-color: var(--heat-burst); }
.unsynced-guidance h2 { margin: 0; color: var(--ash); font-size: 18px; line-height: 1.4; }
.unsynced-guidance p, .unsynced-guidance ol { margin: 0; color: var(--ash-muted); line-height: 1.55; }
.unsynced-guidance ol { padding-left: 22px; }

.empty-deck h2 { margin: 0 0 8px; color: var(--ash); font-size: 18px; }
.empty-deck p { margin: 0; color: var(--ash-muted); }

.round-finished { display: grid; align-content: start; gap: 12px; padding: 20px; }
.round-finished h2 { margin: 0; color: var(--ash); font-size: 18px; }
.round-finished p { margin: 0; color: var(--ash-muted); line-height: 1.6; }
.round-finished .round-finished__result { color: var(--ash); font-weight: 700; }

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
