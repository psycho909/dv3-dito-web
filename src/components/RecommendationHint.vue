<script setup lang="ts">
import type { Recommendation } from '../domain/recommendation'

const props = defineProps<{
  recommendation: Recommendation
  currentScore: number
  estimated: boolean
}>()

function describeRecommendation(): string {
  const { recommendation, currentScore } = props
  const comparison = recommendation.withinRound

  if (recommendation.action === 'NONE') {
    switch (recommendation.reason) {
      case 'NOT_SYNCED':
        return '牌池未同步，無法提供建議。'
      case 'EMPTY_DECK':
        return '牌池沒有剩餘石頭，無法提供建議。'
      case 'COMPUTATION_LIMIT':
        return '目前無法計算建議'
      case 'AT_21':
        return '目前是 21 點，沒有建議動作。'
      case 'BURST':
        return '目前已爆牌，沒有建議動作。'
      default:
        return '目前沒有可用的建議。'
    }
  }

  if (recommendation.reason === 'AT_21') return '目前是 21 點，沒有建議動作。'
  if (recommendation.reason === 'BURST') return '目前已爆牌，沒有建議動作。'

  if (recommendation.action === 'DRAW' && currentScore === 0) {
    return '建議再抽：目前 0 點，下一顆不會爆牌。'
  }

  if (recommendation.action === 'STOP' && comparison) {
    return `建議停手：停在 ${currentScore}，距 21 差 ${comparison.stopDistance}；再抽平均差 ${comparison.drawExpectedDistance.toFixed(2)}。`
  }

  if (recommendation.action === 'DRAW' && comparison) {
    return `建議再抽：停手距 21 差 ${comparison.stopDistance}，再抽平均差 ${comparison.drawExpectedDistance.toFixed(2)}。`
  }

  return recommendation.action === 'STOP' ? '建議停手。' : '建議再抽。'
}
</script>

<template>
  <section
    class="recommendation-hint forge-panel"
    aria-label="本局建議"
  >
    <p
      class="recommendation-hint__message"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        v-if="estimated"
        class="recommendation-hint__estimate"
      >推定牌池</span>
      {{ describeRecommendation() }}
    </p>
    <p class="recommendation-hint__goal">
      以最終點數接近 21 為目標，不代表獎勵最高
    </p>
  </section>
</template>

<style scoped lang="scss">
.recommendation-hint {
  display: grid;
  align-content: start;
  gap: 4px;
  min-height: 84px;
  min-width: 0;
  padding: 12px 16px;
}

.recommendation-hint__message,
.recommendation-hint__goal {
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.recommendation-hint__message { color: var(--ash); font-size: 14px; font-variant-numeric: tabular-nums; }
.recommendation-hint__estimate { color: var(--heat-good); font-weight: 650; }
.recommendation-hint__goal { color: var(--ash-muted); font-size: 13px; }

@media (max-width: 767px) {
  .recommendation-hint { min-height: 124px; padding: 10px 12px; }
}
</style>
