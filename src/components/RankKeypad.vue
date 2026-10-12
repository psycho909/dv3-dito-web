<script setup lang="ts">
import { computed } from 'vue'
import { RANKS, type Deck, type Rank } from '../domain'
import type { SyncState } from '../domain/gameReducer'

const props = defineProps<{
  integrity: SyncState
  stockIsEstimated: boolean
  remainingDeck: Deck
  canRecord: boolean
  riskMode: 'unavailable' | 'next-draw' | 'terminal' | 'next-round'
  worsenProbability: number | null
  downgradeProbability: number | null
  burstProbability: number | null
  riskEstimated: boolean
  riskStatusText: string
}>()

const riskLevel = computed(() => {
  const burstProbability = props.burstProbability
  if (props.riskMode === 'terminal') return 'terminal'
  if (props.riskMode === 'next-round' && burstProbability !== null) return 'forecast'
  if (props.riskMode !== 'next-draw' || burstProbability === null || props.worsenProbability === null) return 'unavailable'
  if (props.worsenProbability < 0.3) return 'normal'
  if (props.worsenProbability < 0.5) return 'caution'
  return 'high'
})
const hasNextDrawRisk = computed(() => props.riskMode === 'next-draw'
  && props.worsenProbability !== null
  && props.downgradeProbability !== null
  && props.burstProbability !== null)
const hasNextRoundForecast = computed(() => props.riskMode === 'next-round'
  && props.burstProbability !== null)
const hasRiskTrack = computed(() => hasNextDrawRisk.value || hasNextRoundForecast.value)
const riskFillProbability = computed(() => props.riskMode === 'next-round'
  ? props.burstProbability : props.worsenProbability)
const riskLabel = computed(() => ({
  normal: '一般',
  caution: '注意',
  high: '高風險',
  terminal: '',
  forecast: '',
  unavailable: '',
}[riskLevel.value]))
const burstPercent = computed(() => props.burstProbability === null
  ? null : `${(props.burstProbability * 100).toFixed(props.riskMode === 'next-round' ? 1 : 2)}%`)
const downgradePercent = computed(() => props.downgradeProbability === null
  ? null : `${(props.downgradeProbability * 100).toFixed(2)}%`)
const worsenPercent = computed(() => props.worsenProbability === null
  ? null : `${(props.worsenProbability * 100).toFixed(2)}%`)
const noWorsenPercent = computed(() => props.worsenProbability === null
  ? null : `${((1 - props.worsenProbability) * 100).toFixed(2)}%`)
const hasDowngrade = computed(() => (props.downgradeProbability ?? 0) > 0)
const riskAriaLabel = computed(() => {
  if (hasNextRoundForecast.value && burstPercent.value !== null) {
    const estimate = props.riskEstimated ? '，推定 52 顆' : ''
    return `下局預估爆牌 ${burstPercent.value}（依建議操作）${estimate}`
  }
  if (hasNextDrawRisk.value
    && burstPercent.value !== null
    && downgradePercent.value !== null
    && worsenPercent.value !== null
    && noWorsenPercent.value !== null) {
    const estimate = props.riskEstimated ? '，依補滿規則推定' : ''
    const downgrade = props.downgradeProbability! > 0 ? `，降級率 ${downgradePercent.value}` : ''
    return `下一顆變差率 ${worsenPercent.value}，爆牌率 ${burstPercent.value}${downgrade}，不變差率 ${noWorsenPercent.value}，${riskLabel.value}${estimate}`
  }
  return props.riskStatusText
})

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
    class="keypad"
    aria-labelledby="keypad-title"
    aria-describedby="keypad-hint"
  >
    <h2
      id="keypad-title"
      class="keypad__title"
    >
      記錄遊戲剛抽到的石頭
    </h2>
    <p
      id="keypad-hint"
      class="sr-only"
    >
      {{ integrity === 'UNSYNCED' || stockIsEstimated
        ? '點數只記錄你在遊戲中已抽出的石頭；剩餘數為推算值，不代表遊戲實際庫存。'
        : '點數只會記錄你在遊戲中已抽出的石頭。' }}
    </p>
    <div
      class="risk-strip"
      data-testid="next-draw-risk"
      :data-risk-level="riskLevel"
      :data-risk-mode="riskMode"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      :aria-label="riskAriaLabel"
    >
      <div
        v-if="hasRiskTrack && burstPercent !== null"
        class="risk-strip__track"
        aria-hidden="true"
      >
        <span
          class="risk-strip__fill"
          :style="{ width: `${(riskFillProbability ?? 0) * 100}%` }"
        />
      </div>
      <template v-if="hasNextDrawRisk && burstPercent !== null && downgradePercent !== null && noWorsenPercent !== null">
        <span class="risk-strip__level">{{ riskLabel }}</span>
        <span class="risk-strip__number">爆牌 <strong>{{ burstPercent }}</strong></span>
        <span
          v-if="hasDowngrade"
          class="risk-strip__number"
        >降級 <strong>{{ downgradePercent }}</strong></span>
        <span class="risk-strip__number">不變差 <strong>{{ noWorsenPercent }}</strong></span>
        <span
          v-if="riskEstimated"
          class="risk-strip__estimate"
        >推定</span>
      </template>
      <template v-else-if="hasNextRoundForecast && burstPercent !== null">
        <span class="risk-strip__forecast">下局預估爆牌 {{ burstPercent }}（依建議操作）</span>
        <span
          v-if="riskEstimated"
          class="risk-strip__estimate"
        >推定 52 顆</span>
      </template>
      <span
        v-else
        class="risk-strip__unavailable"
      >
        {{ riskStatusText }}
      </span>
    </div>
    <div class="keypad__grid">
      <button
        v-for="rank in RANKS"
        :key="rank"
        :ref="(element) => setRankButton(rank, element)"
        class="keypad__key"
        :data-rank-key="rank"
        type="button"
        :disabled="integrity === 'UNINITIALIZED' || !canRecord || remainingDeck[rank] === 0"
        :aria-label="`${rank} 點，${integrity === 'UNINITIALIZED' ? '剩餘數未確認' : `${integrity === 'UNSYNCED' || stockIsEstimated ? '推定剩' : '剩'} ${remainingDeck[rank]}`}`"
        @click="canRecord && emit('select', rank)"
      >
        <span class="keypad__rank">{{ rank }}</span>
        <span class="keypad__remaining">{{ integrity === 'UNINITIALIZED' ? '剩 —' : `${integrity === 'UNSYNCED' || stockIsEstimated ? '推定剩' : '剩'} ${remainingDeck[rank]}` }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.keypad { display: grid; min-width: 0; }
.keypad__title { margin: 0 0 4px; color: var(--ash-muted); font-size: 13px; font-weight: 600; line-height: 1.3; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.risk-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; min-height: 42px; padding: 4px 8px; border: 1px solid var(--seam); border-radius: 4px; background: var(--soot); color: var(--ash); font-size: 13px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.risk-strip__track { box-sizing: border-box; flex: 0 0 100%; height: 5px; overflow: hidden; border: 1px solid var(--seam); background: var(--anvil); }
.risk-strip__fill { position: relative; display: block; width: 0; height: 100%; background: var(--heat-normal); transition: width 120ms ease-out; }
.risk-strip[data-risk-level='caution'] .risk-strip__fill { background: var(--heat-good); }
.risk-strip[data-risk-level='high'] .risk-strip__fill { background: var(--heat-burst); }
.risk-strip[data-risk-level='high'] .risk-strip__fill::after { position: absolute; inset: 0; background-image: repeating-linear-gradient(135deg, color-mix(in srgb, var(--soot), transparent 40%) 0 3px, transparent 3px 7px); content: ''; }
.risk-strip__level { flex: 0 0 auto; font-weight: 700; white-space: nowrap; }
.risk-strip[data-risk-level='normal'] .risk-strip__level { color: var(--ash); }
.risk-strip[data-risk-level='caution'] .risk-strip__level { color: var(--ash); }
.risk-strip[data-risk-level='high'] .risk-strip__level { color: var(--ash); }
.risk-strip__number { white-space: nowrap; }
.risk-strip__number strong { font-weight: 700; }
.risk-strip__estimate { color: var(--ash-muted); white-space: nowrap; }
.risk-strip__unavailable { color: var(--ash-muted); white-space: nowrap; }
.keypad__grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.keypad__key { display: grid; align-content: center; justify-items: center; gap: 4px; min-width: 0; min-height: 60px; padding: 6px 2px; border: 1px solid var(--control-edge); border-radius: 10px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.keypad__rank { display: block; min-width: 3ch; font-size: 20px; font-weight: 700; line-height: 1.2; text-align: center; font-variant-numeric: tabular-nums; }
.keypad__remaining { color: var(--ash-muted); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.keypad__key:hover:not(:disabled) { border-color: var(--focus); background: var(--anvil-raised); }
.keypad__key:active:not(:disabled) { background: var(--anvil); }
.keypad__key:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.keypad__key:disabled { border-style: dashed; background: var(--anvil); color: var(--ash-muted); cursor: not-allowed; }
@media (max-width: 360px) { .keypad__grid { gap: 5px; } .risk-strip { column-gap: 6px; padding-inline: 6px; } }
@media (prefers-reduced-motion: reduce) { .risk-strip__fill { transition: none; } }
</style>
