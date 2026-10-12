<script setup lang="ts">
import { computed } from 'vue'
import { TIER_ORDER } from '../domain'
import type { Recommendation } from '../domain/recommendation'

const props = defineProps<{
  phase: 'current' | 'next'
  recommendation: Recommendation | null
  estimated: boolean
}>()

const title = computed(() => props.phase === 'current' ? '本局最終等級預估' : '下一局等級預估')
const rows = computed(() => {
  const distribution = props.recommendation?.forecast?.tierDistribution
  if (!distribution) return []

  return TIER_ORDER.map((tier) => ({
    tier,
    percentage: `${(distribution[tier] * 100).toFixed(1)}%`,
  }))
})
const unavailableMessage = computed(() => {
  switch (props.recommendation?.reason) {
    case 'NOT_SYNCED': return '牌池未同步，無法顯示等級機率預估。'
    case 'EMPTY_DECK': return '牌池沒有剩餘石頭，無法顯示等級機率預估。'
    case 'COMPUTATION_LIMIT': return '計算超過上限，暫不顯示等級機率與得分。'
    default: return '目前無法顯示等級機率與得分。'
  }
})
</script>

<template>
  <section
    class="tier-forecast forge-panel"
    :aria-label="title"
  >
    <div class="tier-forecast__heading">
      <h3>{{ title }}</h3>
      <span
        v-if="estimated && recommendation?.forecast"
        class="tier-forecast__estimate"
      >依補滿規則推定</span>
    </div>
    <template v-if="recommendation?.forecast && rows.length === TIER_ORDER.length">
      <p class="tier-forecast__assumption">
        假設之後照建議操作；此為機率推估，不代表實際結果。
      </p>
      <ul class="tier-forecast__rows">
        <li
          v-for="row in rows"
          :key="row.tier"
          class="tier-forecast__row"
          :data-forecast-tier-probability="row.tier"
        >
          <span>{{ row.tier }}</span>
          <strong>{{ row.percentage }}</strong>
        </li>
      </ul>
      <p
        class="tier-forecast__expected"
        data-forecast-expected-score
      >
        期望得分 {{ recommendation.forecast.expectedScore.toFixed(2) }} 分
      </p>
    </template>
    <p
      v-else
      class="tier-forecast__unavailable"
    >
      {{ unavailableMessage }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.tier-forecast {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 14px 16px;
}

.tier-forecast__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
}

.tier-forecast h3,
.tier-forecast p { margin: 0; }
.tier-forecast h3 { color: var(--ash); font-size: 15px; }
.tier-forecast__estimate { color: var(--ash-muted); font-size: 13px; }
.tier-forecast__assumption,
.tier-forecast__unavailable { color: var(--ash-muted); font-size: 13px; line-height: 1.5; }

.tier-forecast__rows {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tier-forecast__row {
  display: grid;
  justify-items: center;
  gap: 3px;
  min-width: 0;
  padding: 8px 2px;
  border-radius: 4px;
  background: var(--anvil);
  color: var(--ash-muted);
  font-size: 13px;
}

.tier-forecast__row > span {
  display: block;
  width: 100%;
  overflow-wrap: normal;
  text-align: center;
  white-space: nowrap;
}

.tier-forecast__row strong {
  color: var(--ash);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.tier-forecast__expected { color: var(--ash); font-size: 14px; font-weight: 650; }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 360px) {
  .tier-forecast { padding: 12px; }
  .tier-forecast__rows { gap: 3px; }
  .tier-forecast__row { font-size: 13px; }
  .tier-forecast__row strong { font-size: 13px; }
}

@media (max-width: 480px) {
  .tier-forecast__rows { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
