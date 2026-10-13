<script setup lang="ts">
/* global document, Event, HTMLButtonElement, HTMLDetailsElement, HTMLElement, Blob, URL, setTimeout, __APP_VERSION__ */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import CloudBackupStatus from './components/CloudBackupStatus.vue'
import GitHubAuthPanel from './components/GitHubAuthPanel.vue'
import LocalPersistenceStatus from './components/LocalPersistenceStatus.vue'
import CycleObservation from './components/CycleObservation.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AnalysisTabs from './components/AnalysisTabs.vue'
import PlayHistoryReference from './components/PlayHistoryReference.vue'
import DeckIntegrityStatus from './components/DeckIntegrityStatus.vue'
import HandSummary from './components/HandSummary.vue'
import ProbabilityBreakdown from './components/ProbabilityBreakdown.vue'
import RecommendationHint from './components/RecommendationHint.vue'
import TierForecast from './components/TierForecast.vue'
import RankOutcomeDetail from './components/RankOutcomeDetail.vue'
import DeckStatus from './components/DeckStatus.vue'
import DeckDetailDrawer from './components/DeckDetailDrawer.vue'
import RankKeypad from './components/RankKeypad.vue'
import RoundActions from './components/RoundActions.vue'
import RemainingVerification from './components/RemainingVerification.vue'
import HistoryDrawer from './components/HistoryDrawer.vue'
import DataManagementPanel from './components/DataManagementPanel.vue'
import VersionHistoryDialog from './components/VersionHistoryDialog.vue'
import type { HistoryEdit } from './domain/historyCorrection'
import { classify, formatTierPercentages, TIER_ORDER, type Rank } from './domain'
import { getNewDeckForecast } from './domain/recommendation'
import { ROUND_TOKEN_COST } from './domain/rules'
import { parseChangelog } from './domain/versionHistory'
import { useForgeStore } from './stores/forgeStore'
import changelogMarkdown from '../CHANGELOG.md?raw'

const store = useForgeStore()
const appVersion = __APP_VERSION__
const versionReleases = parseChangelog(changelogMarkdown).releases
const newDeckForecast = getNewDeckForecast()
const keypad = ref<InstanceType<typeof RankKeypad>>()
const roundActions = ref<InstanceType<typeof RoundActions>>()
const recovery = ref<InstanceType<typeof LocalPersistenceStatus>>()
const cloudBackupPanel = ref<InstanceType<typeof CloudBackupStatus>>()
const remainingVerification = ref<InstanceType<typeof RemainingVerification>>()
const accountDetails = ref<HTMLDetailsElement>()
const persistenceFailed = computed(() => store.persistenceStatus === 'ERROR')
const finishDialogOpen = ref(false)
const deckDrawerOpen = ref(false)
const deckDetailTrigger = ref<HTMLElement | null>(null)
const deckStatus = ref<InstanceType<typeof DeckStatus>>()
const remainingVerificationOpen = ref(false)
const remainingVerificationButton = ref<HTMLButtonElement>()
const accountDetailsOpen = ref(false)
const historyDrawerOpen = ref(false)
const versionHistoryOpen = ref(false)
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
const cloudStatusLabel = computed(() => {
  if (store.cloudStatus === 'DISABLED') return store.cloudUserId ? '雲端待記錄' : '雲端待登入'
  const labels = {
    CONNECTING: '雲端核對中',
    SAVING: '雲端備份中',
    BACKED_UP: '雲端已備份',
    OFFLINE_PENDING: '離線待備份',
    ERROR: '雲端錯誤',
    CONFLICT: '雲端衝突',
  } as const
  return labels[store.cloudStatus]
})
const integrityLabel = computed(() => store.integrity === 'UNSYNCED'
  ? '牌池未同步'
  : cycleUnverified.value ? '牌池依規則推定' : '記牌完整')
const integrityAccessibleLabel = computed(() => integrityLabel.value === '記牌完整'
  ? '記牌完整（手動追蹤）'
  : integrityLabel.value)
const accountStatusSummary = computed(() => {
  if (persistenceFailed.value) return '本機儲存錯誤'
  if (store.cloudStatus === 'CONFLICT') return '雲端衝突待處理'
  if (store.cloudStatus === 'ERROR') return '雲端錯誤'
  if (store.cloudStatus === 'OFFLINE_PENDING') return `離線，待送 ${store.pendingCloudCount} 筆`
  if (store.pendingCloudCount > 0) return `待送 ${store.pendingCloudCount} 筆`
  if (store.cloudUserId && store.cloudStatus === 'BACKED_UP') return '已登入，已備份'
  return store.cloudUserId ? '已登入' : '未登入'
})
const recommendationLabel = computed(() => {
  const recommendation = store.recommendation
  if (!recommendation) return ''
  if (recommendation.action === 'DRAW') return '建議再抽'
  if (recommendation.action === 'STOP') return '建議停手'
  if (recommendation.reason === 'NOT_SYNCED') return '牌池未同步，暫無建議'
  if (recommendation.reason === 'EMPTY_DECK') return '牌池為空，暫無建議'
  if (recommendation.reason === 'COMPUTATION_LIMIT') return '目前無法計算建議'
  return '目前沒有可用建議'
})
const stopRecommendationAnnouncement = ref('')
watch(() => store.recommendation?.action, (action, previousAction) => {
  if (action === 'STOP' && previousAction !== 'STOP') {
    stopRecommendationAnnouncement.value = '建議停手，完成本局'
  } else if (action !== 'STOP') {
    stopRecommendationAnnouncement.value = ''
  }
})
const roundExpectation = computed(() => {
  if (store.roundStatus === 'ACTIVE') return null

  const forecast = store.roundForecast
  if (!forecast?.forecast) {
    const reason = forecast?.reason
    const explanation = reason === 'NOT_SYNCED'
      ? '牌池未同步'
      : reason === 'EMPTY_DECK'
        ? '牌池沒有可用石頭'
        : reason === 'COMPUTATION_LIMIT'
          ? '計算超過上限'
          : '目前資料尚未就緒'
    return `下局每 1 遊玩代幣期望得分目前無法計算（${explanation}）。`
  }

  const baselineScore = newDeckForecast.forecast?.expectedScore
  if (baselineScore === undefined) {
    return '下局每 1 遊玩代幣期望得分目前無法計算（新牌池基準計算受限）。'
  }

  const expectedPerToken = forecast.forecast.expectedScore / ROUND_TOKEN_COST
  const baselinePerToken = baselineScore / ROUND_TOKEN_COST
  const difference = (forecast.forecast.expectedScore - baselineScore) / baselineScore * 100
  const comparison = Math.abs(difference) < 0.000001
    ? ''
    : `，較${difference > 0 ? '高' : '低'} ${Math.abs(difference).toFixed(2)}%`
  const estimated = store.roundForecastEstimated ? '，推定' : ''

  return `下局每 1 遊玩代幣期望得分 ${expectedPerToken.toFixed(2)} 分（新牌池基準 ${baselinePerToken.toFixed(2)} 分${comparison}${estimated}）`
})
const riskPresentation = computed(() => {
  if (store.roundStatus === 'ACTIVE' && store.currentScore === 21) {
    return {
      mode: 'terminal' as const,
      worsenProbability: null,
      downgradeProbability: null,
      burstProbability: null,
      estimated: false,
      statusText: '已達 21 點',
    }
  }
  if (store.roundStatus === 'ACTIVE' && store.currentScore > 21) {
    return {
      mode: 'terminal' as const,
      worsenProbability: null,
      downgradeProbability: null,
      burstProbability: null,
      estimated: false,
      statusText: '本局已爆牌',
    }
  }
  if (store.integrity === 'UNINITIALIZED') {
    return { mode: 'unavailable' as const, worsenProbability: null, downgradeProbability: null, burstProbability: null, estimated: false, statusText: '開始記錄後顯示' }
  }
  if (store.integrity === 'UNSYNCED') {
    return { mode: 'unavailable' as const, worsenProbability: null, downgradeProbability: null, burstProbability: null, estimated: false, statusText: '牌池未同步；先核對遊戲剩餘顆數' }
  }
  if (store.roundStatus === 'ACTIVE') {
    if (store.remainingTotal === 0) {
      return { mode: 'unavailable' as const, worsenProbability: null, downgradeProbability: null, burstProbability: null, estimated: false, statusText: '牌池為空，沒有下一顆機率' }
    }
    if (!calculableDraw.value) {
      return { mode: 'unavailable' as const, worsenProbability: null, downgradeProbability: null, burstProbability: null, estimated: false, statusText: '目前無法計算下一顆機率' }
    }
    const currentTierIndex = TIER_ORDER.indexOf(classify(store.currentScore))
    const burstProbability = calculableDraw.value.rankOutcomes
      .filter(({ tier }) => tier === 'BURST')
      .reduce((sum, outcome) => sum + outcome.probability, 0)
    const downgradeProbability = calculableDraw.value.rankOutcomes
      .filter(({ tier }) => tier !== 'BURST' && TIER_ORDER.indexOf(tier) > currentTierIndex)
      .reduce((sum, outcome) => sum + outcome.probability, 0)
    return {
      mode: 'next-draw' as const,
      worsenProbability: burstProbability + downgradeProbability,
      downgradeProbability,
      burstProbability,
      estimated: cycleUnverified.value,
      statusText: '',
    }
  }
  if (store.roundStatus === 'FINISHED') {
    const burstProbability = store.roundForecast?.forecast?.tierDistribution.BURST
    if (burstProbability === undefined) {
      return { mode: 'unavailable' as const, worsenProbability: null, downgradeProbability: null, burstProbability: null, estimated: false, statusText: '目前無法計算下局爆牌率' }
    }
    return {
      mode: 'next-round' as const,
      worsenProbability: null,
      downgradeProbability: null,
      burstProbability,
      estimated: store.roundForecastEstimated,
      statusText: '',
    }
  }
  return { mode: 'unavailable' as const, worsenProbability: null, downgradeProbability: null, burstProbability: null, estimated: false, statusText: '開始記錄後顯示' }
})

async function focusRecovery() {
  if (!persistenceFailed.value) return
  const waitForHistoryClose = historyDrawerOpen.value
  finishDialogOpen.value = false
  deckDrawerOpen.value = false
  historyDrawerOpen.value = false
  accountDetailsOpen.value = true
  await nextTick()
  if (waitForHistoryClose) await nextTick()
  recovery.value?.focusError()
}
watch(persistenceFailed, focusRecovery)
onMounted(focusRecovery)

async function focusCloudAlert() {
  if (persistenceFailed.value || !['ERROR', 'CONFLICT'].includes(store.cloudStatus)) return
  accountDetailsOpen.value = true
  await nextTick()
  cloudBackupPanel.value?.focusAlert()
}
watch(() => store.cloudStatus, focusCloudAlert, { flush: 'post' })
onMounted(focusCloudAlert)

function syncAccountDetails(event: Event) {
  accountDetailsOpen.value = (event.currentTarget as HTMLDetailsElement).open
}

async function setRemainingVerificationOpen(open: boolean) {
  if (remainingVerificationOpen.value === open) return
  remainingVerificationOpen.value = open
  await nextTick()
  if (open) remainingVerification.value?.focusInput()
  else remainingVerificationButton.value?.focus()
}

function toggleRemainingVerification() {
  void setRemainingVerificationOpen(!remainingVerificationOpen.value)
}

function syncRemainingVerification(open: boolean) {
  void setRemainingVerificationOpen(open)
}

function openDeckFromStatus() {
  deckDetailTrigger.value = null
  deckDrawerOpen.value = true
}

function openDeckFromTool(event: Event) {
  deckDetailTrigger.value = event.currentTarget as HTMLElement
  deckDrawerOpen.value = true
}

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
  const trigger = deckDetailTrigger.value
  deckDetailTrigger.value = null
  deckDrawerOpen.value = false
  void nextTick(() => {
    if (trigger?.isConnected) trigger.focus()
    else deckStatus.value?.focus()
  })
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
    <div
      v-if="!persistenceFailed"
      class="forge-app__columns"
    >
      <section
        class="forge-workbench forge-panel"
        data-testid="forge-workbench"
        aria-label="記牌工作台"
      >
        <header
          class="forge-workbench__header"
          data-testid="workbench-title-row"
        >
          <h1>迪特的鐵匠鋪</h1>
          <div class="forge-workbench__meta">
            <span
              v-if="store.integrity !== 'UNINITIALIZED'"
              class="forge-workbench__integrity-status"
              :aria-label="integrityAccessibleLabel"
              :title="integrityAccessibleLabel"
            >{{ integrityLabel }}</span>
            <span
              class="forge-workbench__cloud-status"
              aria-label="雲端備份狀態"
            >{{ cloudStatusLabel }}</span>
            <DeckStatus
              v-if="store.integrity !== 'UNINITIALIZED'"
              ref="deckStatus"
              class="forge-workbench__deck-status"
              :remaining-total="store.remainingTotal"
              @open="openDeckFromStatus"
            />
            <span
              v-else
              class="forge-workbench__unconfirmed-stock"
            >剩餘待確認</span>
          </div>
        </header>

        <div
          class="forge-workbench__scoreboard"
          data-testid="workbench-scoreboard"
        >
          <template v-if="store.integrity === 'UNINITIALIZED'">
            <DeckIntegrityStatus
              :integrity="store.integrity"
              :expected-refill="store.expectedRefill"
              :cycle-unverified="cycleUnverified"
              @confirm="confirmRecording"
            />
            <p
              v-if="roundExpectation"
              class="forge-workbench__expectation"
              data-testid="round-expectation"
            >
              {{ roundExpectation }}
            </p>
          </template>
          <HandSummary
            v-else
            :current-hand="store.currentHand"
            :current-score="store.currentScore"
            :recommendation-label="recommendationLabel"
            :recommendation-stop="store.recommendation?.action === 'STOP'"
            :stop-announcement="stopRecommendationAnnouncement"
            :estimated="cycleUnverified"
            :finished="store.roundStatus === 'FINISHED'"
            :active="store.roundStatus === 'ACTIVE'"
            :round-expectation="roundExpectation"
          />
        </div>

        <RankKeypad
          ref="keypad"
          class="forge-workbench__keypad"
          :integrity="store.integrity"
          :stock-is-estimated="cycleUnverified"
          :remaining-deck="store.remainingDeck"
          :can-record="store.canRecord"
          :current-tier="classify(store.currentScore)"
          :risk-mode="riskPresentation.mode"
          :worsen-probability="riskPresentation.worsenProbability"
          :downgrade-probability="riskPresentation.downgradeProbability"
          :burst-probability="riskPresentation.burstProbability"
          :risk-estimated="riskPresentation.estimated"
          :risk-status-text="riskPresentation.statusText"
          @select="recordDraw"
        />
        <RoundActions
          ref="roundActions"
          class="forge-workbench__actions"
          :round-status="store.roundStatus ?? 'UNINITIALIZED'"
          :can-undo-draw="store.canUndoDraw"
          :announcement="roundAnnouncement"
          :recommendation-stop="store.recommendation?.action === 'STOP'"
          @undo="undoDraw"
          @finish="finishDialogOpen = true"
          @start="startRound"
        />
      </section>

      <section
        class="forge-app__results"
        data-testid="forge-app-details"
        aria-label="機率與牌局分析"
      >
        <AnalysisTabs>
          <template #next>
            <p
              v-if="store.integrity === 'UNINITIALIZED'"
              class="analysis-message"
            >
              確認開始記錄後，這裡會顯示下一顆機率。
            </p>
            <section
              v-if="store.integrity === 'UNSYNCED'"
              class="unsynced-guidance"
              aria-live="polite"
            >
              <h2>目前不能保證精確機率</h2>
              <p>仍可繼續記錄與撤銷。輸入遊戲當下剩餘數，與工具依紀錄推算的總數相符即可恢復同步；總數相同不代表各點數都正確。若最近一次補滿確認回答「不是 52 顆」，且之後尚未確認新的補滿或手動重置，即使總數相符仍維持未同步。</p>
              <ol>
                <li>若漏記了已抽出的石頭且知道點數，按下對應點數補記；不依總數差額猜牌。</li>
                <li>若最近一次記錄錯誤，使用「撤銷輸入」移除該筆。</li>
                <li>展開「核對剩餘」，輸入遊戲當下顆數；每次輸入會更新上次回報，不符時維持未同步。</li>
                <li>若最近一次補滿確認回答「不是 52 顆」，且之後尚未確認新的補滿或手動重置，請先確認新週期已補滿。</li>
              </ol>
              <p>舊局記錯可從「查看歷史與修正」預覽修正，也可從「備份與資料管理」匯入有效備份。總數核對不會推算或修改各點數庫存。</p>
            </section>
            <ProbabilityBreakdown
              v-if="store.roundStatus === 'ACTIVE' && calculableDraw"
              :outcomes="calculableDraw.tierOutcomes"
              :percentages="tierPercentages"
              :remaining-total="calculableDraw.remainingTotal"
              :estimated="cycleUnverified"
            />
            <RankOutcomeDetail
              v-if="store.roundStatus === 'ACTIVE' && calculableDraw"
              :outcomes="calculableDraw.rankOutcomes"
              :remaining-total="calculableDraw.remainingTotal"
            />
            <section
              v-else-if="store.integrity === 'SYNCED' && store.roundStatus === 'ACTIVE'"
              class="empty-deck"
              aria-live="polite"
            >
              <h2>目前沒有可抽取的石頭</h2>
              <p>牌池剩餘 0 顆，沒有下一顆機率可供計算。</p>
            </section>
            <section
              v-else-if="store.roundStatus === 'FINISHED'"
              class="round-finished"
            >
              <h2>本局已完成</h2>
              <p v-if="store.integrity === 'UNSYNCED'">
                上方保留本局最終手牌與分數；依手動記錄推算剩 {{ store.remainingTotal }} 顆，不代表遊戲實際庫存。
              </p>
              <p v-else>
                上方保留本局最終手牌與分數；牌池保留在剩 {{ store.remainingTotal }} 顆，沒有抽取額外石頭。
              </p>
              <p>下一顆機率只會在開始新局後顯示。</p>
            </section>
            <DeckIntegrityStatus
              v-if="store.integrity !== 'UNINITIALIZED' && (store.expectedRefill || cycleUnverified)"
              :integrity="store.integrity"
              :expected-refill="store.expectedRefill"
              :cycle-unverified="cycleUnverified"
              hide-status
            />
          </template>

          <template #round>
            <RecommendationHint
              v-if="store.integrity === 'SYNCED' && store.roundStatus === 'ACTIVE' && store.recommendation"
              :recommendation="store.recommendation"
              :current-score="store.currentScore"
              :estimated="cycleUnverified"
            />
            <TierForecast
              :phase="store.roundStatus === 'ACTIVE' ? 'current' : 'next'"
              :recommendation="store.roundForecast"
              :estimated="store.roundForecastEstimated || cycleUnverified"
            />
          </template>

          <template #tokens>
            <PlayHistoryReference
              :rounds="store.rounds"
              :round-forecast="store.roundForecast"
              :new-deck-forecast="newDeckForecast"
            />
          </template>
        </AnalysisTabs>
      </section>
    </div>

    <div class="forge-app__lower">
      <template v-if="!persistenceFailed">
        <section
          class="forge-app__tools"
          aria-labelledby="deck-tools-title"
        >
          <h2
            id="deck-tools-title"
            class="sr-only"
          >
            牌池工具
          </h2>
          <div
            class="forge-app__tool-row"
            role="group"
            aria-label="牌池工具"
          >
            <button
              ref="remainingVerificationButton"
              type="button"
              :aria-expanded="remainingVerificationOpen"
              :aria-controls="remainingVerificationOpen ? 'remaining-verification' : undefined"
              :disabled="store.integrity === 'UNINITIALIZED'"
              @click="toggleRemainingVerification"
            >
              核對剩餘
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              :disabled="store.integrity === 'UNINITIALIZED'"
              @click="openDeckFromTool"
            >
              牌池明細
            </button>
            <button
              ref="historyButton"
              type="button"
              data-history-open
              aria-haspopup="dialog"
              :disabled="store.integrity === 'UNINITIALIZED'"
              @click="openHistory"
            >
              歷史與修正
            </button>
          </div>
          <RemainingVerification
            v-if="remainingVerificationOpen"
            ref="remainingVerification"
            :verified-remaining-count="store.verifiedRemainingCount ?? null"
            :tool-remaining="store.remainingTotal"
            :integrity="store.integrity === 'UNSYNCED' ? 'UNSYNCED' : 'SYNCED'"
            :opened="remainingVerificationOpen"
            @verify="verifyRemaining"
            @toggle="syncRemainingVerification"
          />
        </section>
        <CycleObservation
          v-if="store.currentCycle?.reason === 'BELOW_15_NEXT_ROUND'"
          :key="store.currentCycle.id"
          :cycle="store.currentCycle"
          :prompt-open="cyclePromptOpen"
          @answer="observeCycle"
          @later="deferCycleObservation"
          @reopen="openObservationCycleId = store.currentCycle?.id ?? null"
        />
      </template>

      <details
        ref="accountDetails"
        class="forge-app__account-details"
        data-account-details
        :open="accountDetailsOpen"
        @toggle="syncAccountDetails"
      >
        <summary>
          <span>帳號與備份</span>
          <span class="forge-app__account-state">{{ accountStatusSummary }}</span>
        </summary>
        <LocalPersistenceStatus
          v-if="persistenceFailed"
          ref="recovery"
          :error="store.persistenceError ?? '無法安全讀取或儲存本機紀錄。'"
          :raw-data="store.rawStoredData"
          @retry="retryPersistence"
        />
        <template v-else>
          <GitHubAuthPanel />
          <CloudBackupStatus ref="cloudBackupPanel" />
          <DataManagementPanel
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
        </template>
      </details>
    </div>

    <footer class="forge-app__footer">
      <p class="forge-app__footer-message">
        <template v-if="!persistenceFailed">
          合法操作會保存於此瀏覽器；重新整理可恢復紀錄。清除瀏覽器資料會失去本機紀錄。
        </template>
        <template v-else>
          本機資料尚未恢復，遊戲操作已暫停。
        </template>
      </p>
      <div class="forge-app__footer-version">
        <span>v{{ appVersion }}</span>
        <button
          type="button"
          aria-haspopup="dialog"
          data-version-history-open
          @click="versionHistoryOpen = true"
        >
          版本紀錄
        </button>
      </div>
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
    <VersionHistoryDialog
      v-model:open="versionHistoryOpen"
      :releases="versionReleases"
    />
  </main>
</template>

<style scoped lang="scss">
.forge-app {
  display: grid;
  gap: 16px;
  width: min(100%, 1200px);
  margin: 0 auto;
}

.forge-app__columns {
  display: grid;
  align-items: start;
  gap: 16px;
  min-width: 0;
}

.forge-workbench {
  display: grid;
  gap: 0;
  min-width: 0;
  padding: 8px 12px;
  overflow: hidden;
}

.forge-workbench__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
}

.forge-workbench__header h1 {
  flex: 0 0 auto;
  margin: 0;
  color: var(--heat-good);
  font-size: 18px;
  line-height: 1.2;
  white-space: nowrap;
}

.forge-workbench__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.forge-workbench__cloud-status,
.forge-workbench__integrity-status,
.forge-workbench__unconfirmed-stock {
  overflow: hidden;
  color: var(--ash-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forge-workbench__cloud-status { max-width: 120px; }
.forge-workbench__integrity-status { max-width: 108px; }
.forge-workbench__unconfirmed-stock { padding-inline: 4px; }
.forge-workbench__deck-status { flex: 0 0 auto; }

.forge-workbench__scoreboard {
  display: grid;
  align-content: center;
  min-width: 0;
  min-height: 176px;
  padding: 8px 0;
  border-block: 1px solid var(--seam);
  box-sizing: border-box;
}

.forge-workbench__expectation {
  margin: 6px 0 0;
  color: var(--ash-muted);
  font-size: 12px;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  overflow-wrap: normal;
}

.forge-workbench__keypad { padding-block: 8px; }
.forge-workbench__actions { padding-top: 8px; border-top: 1px solid var(--seam); }

.forge-app__results {
  display: grid;
  align-content: start;
  min-width: 0;
}

:global(.forge-app__results > .forge-panel) {
  margin: 0;
  padding: 16px 0;
  border: 0;
  border-bottom: 1px solid var(--seam);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

:global(.forge-app__results > .forge-panel:last-child) { border-bottom: 0; }

.forge-app__lower {
  display: grid;
  min-width: 0;
  border-top: 1px solid var(--seam);
}

.forge-app__lower > * + * {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--seam);
}

.forge-app__tool-row { display: flex; flex-wrap: wrap; gap: 8px; }
.forge-app__tool-row button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--control-edge); border-radius: 4px; background: transparent; color: var(--ash); font: inherit; cursor: pointer; }
.forge-app__tool-row button:hover:not(:disabled) { background: var(--anvil-raised); }
.forge-app__tool-row button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.forge-app__tool-row button:disabled { opacity: .55; cursor: not-allowed; }

.forge-app__account-details { min-width: 0; }
.forge-app__account-details > summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; min-height: 48px; color: var(--ash); font-weight: 700; cursor: pointer; }
.forge-app__account-details > summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.forge-app__account-state { color: var(--ash-muted); font-size: 13px; font-weight: 400; }
.forge-app__account-details > :deep(.forge-panel) { margin: 0; padding: 12px 0 0; border: 0; border-top: 1px solid var(--seam); border-radius: 0; background: transparent; box-shadow: none; }
.forge-app__account-details > :deep(.data-management) { padding-top: 12px; }

.empty-deck {
  padding: 16px 0;
}

.unsynced-guidance { display: grid; gap: 8px; border-color: var(--heat-burst); }
.unsynced-guidance h2 { margin: 0; color: var(--ash); font-size: 18px; line-height: 1.4; }
.unsynced-guidance p, .unsynced-guidance ol { margin: 0; color: var(--ash-muted); line-height: 1.55; }
.unsynced-guidance ol { padding-left: 22px; }

.empty-deck h2 { margin: 0 0 8px; color: var(--ash); font-size: 18px; }
.empty-deck p { margin: 0; color: var(--ash-muted); }

.round-finished { display: grid; align-content: start; gap: 12px; }
.round-finished h2 { margin: 0; color: var(--ash); font-size: 18px; }
.round-finished p { margin: 0; color: var(--ash-muted); line-height: 1.6; }

.forge-app__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--seam);
  color: var(--ash-muted);
  font-size: 13px;
  line-height: 1.5;
}

.forge-app__footer-message { flex: 1 1 240px; min-width: 0; margin: 0; overflow-wrap: anywhere; }
.forge-app__footer-version { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.forge-app__footer-version button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil); color: var(--ash); font: inherit; cursor: pointer; }
.forge-app__footer-version button:hover { background: var(--anvil-raised); }
.forge-app__footer-version button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

@media (min-width: 768px) and (max-width: 1023px) {
  .forge-app__columns { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 1024px) {
  .forge-app__columns {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 24px;
  }
  .forge-app__results {
    padding-left: 16px;
    border-left: 1px solid var(--seam);
  }
}

@media (max-width: 767px) {
  .forge-app { gap: 12px; }
  .forge-workbench { padding-inline: 10px; }
  .forge-workbench__cloud-status { max-width: 88px; }
  .forge-workbench__integrity-status { max-width: 76px; }
}

@media (max-width: 360px) {
  .forge-workbench { padding-inline: 8px; }
  .forge-workbench__header { gap: 4px; }
  .forge-workbench__header h1 { font-size: 16px; }
  .forge-workbench__cloud-status { max-width: 74px; font-size: 13px; }
  .forge-workbench__integrity-status { max-width: 66px; }
  .forge-workbench__meta { gap: 2px; }
}
</style>
