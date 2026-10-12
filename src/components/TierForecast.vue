<script setup lang="ts">
import { computed } from 'vue'
import { TIER_ORDER } from '../domain'
import type { Recommendation } from '../domain/recommendation'
import { ROUND_MULTIPLIERS, ROUND_TOKEN_COST } from '../domain/rules'

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
const multiplierRows = computed(() => {
  const expectedScore = props.recommendation?.forecast?.expectedScore
  if (props.phase !== 'next' || expectedScore === undefined) return []

  return ROUND_MULTIPLIERS.map((multiplier) => ({
    multiplier,
    tokenCost: ROUND_TOKEN_COST * multiplier,
    expectedScore: (Math.round(expectedScore * multiplier * 10) / 10).toFixed(1),
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
      <section
        v-if="multiplierRows.length"
        class="tier-forecast__multiplier"
        data-testid="multiplier-forecast"
        aria-label="倍率、遊玩代幣花費與期望得分對照"
      >
        <p class="tier-forecast__multiplier-note">
          1 局 = {{ ROUND_TOKEN_COST }} 遊玩代幣 × 倍數
        </p>
        <table class="tier-forecast__multiplier-table">
          <caption class="sr-only">
            倍率、遊玩代幣花費與期望得分對照
          </caption>
          <thead>
            <tr>
              <th scope="col">
                倍率
              </th>
              <th scope="col">
                遊玩代幣花費
              </th>
              <th scope="col">
                期望得分
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in multiplierRows"
              :key="row.multiplier"
              :data-multiplier-row="row.multiplier"
            >
              <th scope="row">
                x{{ row.multiplier }}
              </th>
              <td>{{ row.tokenCost }}</td>
              <td>{{ row.expectedScore }}</td>
            </tr>
          </tbody>
        </table>
        <p class="tier-forecast__multiplier-note">
          倍率在開局前決定；得分與花費同比放大，每 1 遊玩代幣期望得分不因倍率改變。
        </p>
      </section>
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

.tier-forecast__multiplier { display: grid; gap: 6px; min-width: 0; }
.tier-forecast__multiplier-note { color: var(--ash-muted); font-size: 13px; line-height: 1.5; }
.tier-forecast__multiplier-table { width: 100%; border-collapse: collapse; color: var(--ash); font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; }
.tier-forecast__multiplier-table th,
.tier-forecast__multiplier-table td { padding: 5px 8px; border-bottom: 1px solid var(--seam); white-space: nowrap; }
.tier-forecast__multiplier-table thead th { color: var(--ash-muted); font-weight: 600; }
.tier-forecast__multiplier-table th:first-child,
.tier-forecast__multiplier-table tbody th { text-align: left; }
.tier-forecast__multiplier-table tbody th { font-weight: 650; }
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
