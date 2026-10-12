<script setup lang="ts">
import { computed, ref } from 'vue'
import { TIER_ORDER, type Tier } from '../domain'
import type { RoundRecord } from '../domain/gameReducer'
import type { Recommendation } from '../domain/recommendation'
import { ROUND_MULTIPLIERS, ROUND_TOKEN_COST } from '../domain/rules'
import {
  scoreInterval95,
  summarizePlayHistory,
  tierScoreVariance,
} from '../domain/playHistory'

const props = defineProps<{
  rounds: readonly RoundRecord[]
  roundForecast: Recommendation | null
  newDeckForecast: Recommendation | null
}>()

const quickAmounts = [1000, 3000, 6000, 10000] as const
const tokenInput = ref('')
const history = computed(() => summarizePlayHistory(props.rounds))
const baseline = computed(() => props.newDeckForecast?.forecast ?? null)
const currentExpectedScore = computed(() => props.roundForecast?.forecast?.expectedScore ?? null)
const baselinePerToken = computed(() => baseline.value
  ? baseline.value.expectedScore / ROUND_TOKEN_COST : null)
const currentPerToken = computed(() => currentExpectedScore.value === null
  ? null : currentExpectedScore.value / ROUND_TOKEN_COST)
const myPerToken = computed(() => history.value.averagePerToken)

const differenceFromBaseline = computed(() => {
  if (myPerToken.value === null || baselinePerToken.value === null || baselinePerToken.value === 0) return null
  return (myPerToken.value - baselinePerToken.value) / baselinePerToken.value * 100
})

const comparisonRows = computed(() => {
  const values = [currentPerToken.value, baselinePerToken.value, myPerToken.value]
  const scale = Math.max(...values.filter((value): value is number => value !== null), 0)
  return [
    { id: 'current', label: '這一局（理論）', value: currentPerToken.value },
    { id: 'baseline', label: '新牌池基準', value: baselinePerToken.value },
    { id: 'actual', label: `我的實際（${history.value.completedRounds} 局）`, value: myPerToken.value },
  ].map((row) => ({
    ...row,
    width: row.value === null || scale === 0 ? 0 : row.value / scale * 100,
    text: row.value === null
      ? row.id === 'actual' ? '完成第一局後顯示' : '目前無法估算'
      : `${row.value.toFixed(2)} 分`,
  }))
})

const tierRows = computed(() => TIER_ORDER.map((tier: Tier) => ({
  tier,
  actual: history.value.tierPercentages[tier],
  theoretical: baseline.value?.tierDistribution[tier] ?? 0,
  actualLabel: `${(history.value.tierPercentages[tier] * 100).toFixed(1)}%`,
  theoreticalLabel: `${((baseline.value?.tierDistribution[tier] ?? 0) * 100).toFixed(1)}%`,
})))

const tokenInputError = computed(() => {
  if (tokenInput.value === '') return ''
  if (!/^\d+$/.test(tokenInput.value)) return '請輸入非負整數。'
  if (!Number.isSafeInteger(Number(tokenInput.value))) return '數量超出可計算範圍。'
  return ''
})
const tokenCount = computed(() => tokenInput.value !== '' && !tokenInputError.value
  ? Number(tokenInput.value) : null)
const playableRounds = computed(() => tokenCount.value === null
  ? null : Math.floor(tokenCount.value / ROUND_TOKEN_COST))
const remainingTokens = computed(() => tokenCount.value === null
  ? 0 : tokenCount.value % ROUND_TOKEN_COST)
const actualTotal = computed(() => playableRounds.value === null || history.value.averageScore === null
  ? null : playableRounds.value * history.value.averageScore)
const baselineTotal = computed(() => playableRounds.value === null || baseline.value === null
  ? null : playableRounds.value * baseline.value.expectedScore)
const intervalsVisible = computed(() => history.value.completedRounds >= 30 && (playableRounds.value ?? 0) > 0)
const actualInterval = computed(() => intervalsVisible.value
  && history.value.averageScore !== null
  && history.value.sampleStandardDeviation !== null
  && playableRounds.value !== null
  ? scoreInterval95(history.value.averageScore, history.value.sampleStandardDeviation, playableRounds.value)
  : null)
const baselineInterval = computed(() => intervalsVisible.value
  && baseline.value !== null
  && playableRounds.value !== null
  ? scoreInterval95(
    baseline.value.expectedScore,
    Math.sqrt(tierScoreVariance(baseline.value.tierDistribution)),
    playableRounds.value,
  )
  : null)

const multiplierRows = computed(() => currentExpectedScore.value === null ? [] : ROUND_MULTIPLIERS.map((multiplier) => ({
  multiplier,
  tokenCost: ROUND_TOKEN_COST * multiplier,
  expectedScore: Math.round(currentExpectedScore.value! * multiplier),
})))

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function formatInterval(interval: { lower: number; upper: number } | null): string | null {
  if (!interval) return null
  return `多數情況 ${formatInteger(interval.lower)}～${formatInteger(interval.upper)} 分`
}

function selectQuickAmount(amount: number) {
  tokenInput.value = String(amount)
}
</script>

<template>
  <section
    class="play-history"
    data-testid="play-history-reference"
    aria-labelledby="play-history-title"
  >
    <header class="play-history__heading">
      <div>
        <p class="play-history__eyebrow">
          每 1 遊玩代幣得分比較
        </p>
        <h2 id="play-history-title">
          我的遊玩紀錄
        </h2>
      </div>
      <span class="play-history__count">已完成 {{ history.completedRounds }} 局</span>
    </header>
    <p
      class="play-history__average"
      data-testid="play-history-average"
    >
      <template v-if="history.averageScore !== null">
        實際平均 {{ history.averageScore.toFixed(2) }} 分／局；每 1 遊玩代幣 {{ history.averagePerToken?.toFixed(2) }} 分。
      </template>
      <template v-else>
        完成第一局後顯示實際平均得分與每 1 遊玩代幣得分。
      </template>
    </p>

    <p
      v-if="history.completedRounds < 30"
      class="play-history__sample-note"
      data-testid="play-history-sample-note"
    >
      樣本少，僅供參考<span v-if="history.completedRounds === 0">；完成第一局後顯示我的實際成績</span>
    </p>
    <p class="play-history__explanation">
      以 x1 計算，沒有記錄實際倍率。差異可能來自運氣、未照建議操作或記錄錯誤，本工具不判斷原因。
    </p>

    <section
      class="play-history__comparison"
      aria-label="每 1 遊玩代幣得分比較"
    >
      <ul class="play-history__score-bars">
        <li
          v-for="row in comparisonRows"
          :key="row.id"
          class="play-history__score-row"
          :data-score-comparison="row.id"
        >
          <div class="play-history__score-label">
            <span>{{ row.label }}</span>
            <strong>{{ row.text }}</strong>
          </div>
          <div
            class="play-history__score-track"
            role="img"
            :aria-label="`${row.label}：${row.text}`"
          >
            <span
              class="play-history__score-fill"
              :class="`play-history__score-fill--${row.id}`"
              :style="{ width: `${row.width}%` }"
            />
          </div>
        </li>
      </ul>
      <p
        v-if="baselinePerToken !== null"
        class="play-history__baseline-line"
        data-testid="new-deck-baseline"
      >
        新牌池基準：每 1 遊玩代幣期望得分 {{ baselinePerToken.toFixed(2) }} 分。
      </p>
      <p
        v-if="differenceFromBaseline !== null"
        class="play-history__difference"
        data-testid="history-baseline-difference"
      >
        {{ differenceFromBaseline === 0
          ? '與新牌池基準相同'
          : `比新牌池基準${differenceFromBaseline > 0 ? '高' : '低'} ${Math.abs(differenceFromBaseline).toFixed(2)}%` }}
      </p>
    </section>

    <section
      class="play-history__conversion"
      aria-labelledby="token-conversion-title"
    >
      <div class="play-history__section-heading">
        <h3 id="token-conversion-title">
          遊玩代幣換算預估
        </h3>
        <p>1 局 = {{ ROUND_TOKEN_COST }} 遊玩代幣 × 倍數</p>
      </div>
      <p class="play-history__multiplier-note">
        倍率只放大每場花費與得分，總分預估不變。純參考，實際結果依運氣與操作而定。
      </p>
      <label for="play-token-count">遊玩代幣數量</label>
      <input
        id="play-token-count"
        v-model="tokenInput"
        data-testid="play-token-count"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :aria-invalid="tokenInputError ? 'true' : undefined"
        :aria-describedby="tokenInputError ? 'play-token-count-help play-token-count-error' : 'play-token-count-help'"
      >
      <p
        id="play-token-count-help"
        class="play-history__help"
      >
        輸入非負整數，或選擇常用數量。
      </p>
      <p
        v-if="tokenInputError"
        id="play-token-count-error"
        class="play-history__error"
        role="alert"
      >
        {{ tokenInputError }}
      </p>
      <div
        class="play-history__quick-amounts"
        aria-label="常用遊玩代幣數量"
      >
        <button
          v-for="amount in quickAmounts"
          :key="amount"
          type="button"
          :aria-label="`填入 ${formatInteger(amount)} 遊玩代幣`"
          @click="selectQuickAmount(amount)"
        >
          {{ formatInteger(amount) }}
        </button>
      </div>

      <template v-if="tokenCount !== null">
        <div
          class="play-history__estimate-results"
          data-testid="play-token-estimates"
        >
          <section
            class="play-history__estimate-primary"
            aria-label="依我的紀錄預估"
          >
            <h4>依我的紀錄</h4>
            <p
              class="play-history__estimate-total"
              data-testid="my-token-total"
            >
              {{ actualTotal === null ? '完成第一局後可依紀錄估算' : `約 ${formatInteger(actualTotal)} 分` }}
            </p>
            <p
              v-if="playableRounds !== null"
              class="play-history__games"
            >
              {{ formatInteger(playableRounds) }} 場（x1 計）
            </p>
            <p
              v-if="formatInterval(actualInterval)"
              class="play-history__interval"
            >
              95% 參考區間：{{ formatInterval(actualInterval) }}。
            </p>
          </section>
          <section
            class="play-history__estimate-baseline"
            aria-label="依新牌池基準預估"
          >
            <h4>依新牌池基準</h4>
            <p data-testid="baseline-token-total">
              {{ baselineTotal === null ? '目前無法估算' : `約 ${formatInteger(baselineTotal)} 分` }}
            </p>
            <p
              v-if="playableRounds !== null"
              class="play-history__games"
            >
              {{ formatInteger(playableRounds) }} 場（x1 計）
            </p>
            <p
              v-if="formatInterval(baselineInterval)"
              class="play-history__interval"
            >
              95% 參考區間：{{ formatInterval(baselineInterval) }}。
            </p>
          </section>
        </div>
        <p
          v-if="remainingTokens > 0"
          class="play-history__remainder"
          data-testid="token-remainder"
        >
          剩 {{ remainingTokens }} 遊玩代幣不足一場。
        </p>
      </template>
    </section>

    <section
      class="play-history__distribution"
      aria-labelledby="tier-distribution-title"
    >
      <div class="play-history__section-heading">
        <h3 id="tier-distribution-title">
          等級分布
        </h3>
        <p>實際成績對照新牌池基準理論比例</p>
      </div>
      <ul class="play-history__tier-list">
        <li
          v-for="row in tierRows"
          :key="row.tier"
          class="play-history__tier-row"
          :data-history-tier="row.tier"
        >
          <strong>{{ row.tier }}</strong>
          <div
            class="play-history__tier-track"
            role="img"
            :aria-label="`${row.tier}：實際 ${row.actualLabel}，理論 ${row.theoreticalLabel}`"
          >
            <span
              class="play-history__tier-actual"
              :style="{ width: `${row.actual * 100}%` }"
            />
            <span
              class="play-history__tier-theory"
              :style="{ left: `${row.theoretical * 100}%` }"
            />
          </div>
          <span class="play-history__tier-values">實際 {{ row.actualLabel }}／理論 {{ row.theoreticalLabel }}</span>
        </li>
      </ul>
    </section>

    <section
      class="play-history__multipliers"
      aria-labelledby="multiplier-reference-title"
    >
      <div class="play-history__section-heading">
        <h3 id="multiplier-reference-title">
          倍率參考
        </h3>
        <p>以這一局（理論）期望得分換算</p>
      </div>
      <ul
        v-if="multiplierRows.length"
        class="play-history__multiplier-list"
        data-testid="multiplier-reference"
      >
        <li
          v-for="row in multiplierRows"
          :key="row.multiplier"
          :data-multiplier="row.multiplier"
        >
          <span>x{{ row.multiplier }}</span>
          <span>{{ formatInteger(row.tokenCost) }} 遊玩代幣</span>
          <strong>{{ formatInteger(row.expectedScore) }} 分</strong>
        </li>
      </ul>
      <p
        v-else
        class="play-history__help"
      >
        目前無法估算倍率參考。
      </p>
    </section>
  </section>
</template>

<style scoped lang="scss">
.play-history { display: grid; gap: 16px; min-width: 0; color: var(--ash); }
.play-history section { display: grid; gap: 10px; min-width: 0; padding-bottom: 14px; border-bottom: 1px solid var(--seam); }
.play-history__heading, .play-history__section-heading, .play-history__score-label { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.play-history__heading h2, .play-history h3, .play-history h4, .play-history p { margin: 0; }
.play-history__eyebrow { color: var(--ash-muted); font-size: 13px; }
.play-history__heading h2 { font-size: 19px; }
.play-history__count, .play-history__average, .play-history__sample-note, .play-history__explanation, .play-history__section-heading p, .play-history__help, .play-history__multiplier-note { color: var(--ash-muted); font-size: 13px; line-height: 1.5; }
.play-history__average { font-variant-numeric: tabular-nums; }
.play-history__sample-note { color: var(--heat-caution); font-weight: 650; }
.play-history__section-heading h3 { font-size: 16px; }
.play-history__explanation { max-width: 72ch; }
.play-history__score-bars, .play-history__tier-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.play-history__multiplier-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.play-history__score-row { display: grid; gap: 5px; }
.play-history__score-label { gap: 4px 12px; font-size: 13px; }
.play-history__score-label strong { font-variant-numeric: tabular-nums; white-space: nowrap; }
.play-history__score-track, .play-history__tier-track { position: relative; height: 10px; overflow: hidden; border: 1px solid var(--seam); border-radius: 2px; background: var(--soot); }
.play-history__score-fill { display: block; height: 100%; background: var(--heat-normal); }
.play-history__score-fill--baseline { background: var(--heat-perfect); }
.play-history__score-fill--actual { background: var(--heat-great); }
.play-history__baseline-line, .play-history__difference { color: var(--ash-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.play-history__conversion { grid-template-columns: minmax(0, 1fr); }
.play-history__section-heading h3 { color: var(--ash); }
.play-history__conversion label { font-weight: 650; }
.play-history__conversion input { width: 100%; min-width: 0; min-height: 44px; padding: 8px 10px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--soot); color: var(--ash); font: inherit; font-variant-numeric: tabular-nums; }
.play-history__conversion input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.play-history__conversion input[aria-invalid='true'] { border-color: var(--heat-burst); }
.play-history__help { margin: 0; }
.play-history__error { color: var(--heat-burst); font-size: 13px; }
.play-history__quick-amounts { display: flex; flex-wrap: wrap; gap: 8px; }
.play-history__quick-amounts button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--control-edge); border-radius: 4px; background: transparent; color: var(--ash); font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; }
.play-history__quick-amounts button:hover { background: var(--anvil-raised); }
.play-history__quick-amounts button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.play-history__estimate-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding-top: 10px; border-top: 1px solid var(--seam); }
.play-history__estimate-results section { gap: 4px; padding: 0; border: 0; }
.play-history__estimate-results h4 { color: var(--ash-muted); font-size: 13px; }
.play-history__estimate-results p { color: var(--ash); font-size: 13px; }
.play-history__estimate-results .play-history__estimate-total { font-size: 22px; font-weight: 750; font-variant-numeric: tabular-nums; }
.play-history__games, .play-history__interval { color: var(--ash-muted) !important; }
.play-history__remainder { color: var(--ash-muted); font-size: 13px; }
.play-history__tier-row { display: grid; grid-template-columns: minmax(54px, .6fr) minmax(0, 2fr) minmax(150px, 1.25fr); align-items: center; gap: 8px; font-size: 13px; }
.play-history__tier-track { height: 9px; overflow: visible; }
.play-history__tier-actual { position: absolute; inset: 0 auto 0 0; background: var(--heat-normal); }
.play-history__tier-theory { position: absolute; z-index: 1; inset-block: -3px; width: 2px; background: var(--ash); }
.play-history__tier-values { color: var(--ash-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.play-history__multiplier-note { margin-top: -4px; }
.play-history__multiplier-list li { display: flex; flex: 1 1 150px; align-items: baseline; justify-content: space-between; gap: 4px; min-width: 0; padding: 7px 8px; border: 1px solid var(--seam); border-radius: 3px; font-size: 13px; font-variant-numeric: tabular-nums; }
.play-history__multiplier-list li > span { white-space: nowrap; }
.play-history__multiplier-list li > span:nth-child(2) { color: var(--ash-muted); }
.play-history__multiplier-list strong { white-space: nowrap; }

@media (min-width: 768px) {
  .play-history { gap: 20px; }
  .play-history__multiplier-list li { flex-basis: 180px; }
}

@media (max-width: 480px) {
  .play-history__tier-row { grid-template-columns: 58px minmax(0, 1fr); gap: 5px 8px; }
  .play-history__tier-track { grid-column: 2; grid-row: 1; }
  .play-history__tier-values { grid-column: 2; white-space: normal; }
  .play-history__estimate-results { gap: 8px; }
  .play-history__estimate-results .play-history__estimate-total { font-size: 19px; }
}
</style>
