<script setup lang="ts">
import { TIER_ORDER, type Tier } from '../domain'

type TierOutcome = {
  tier: Tier
  matchingCount: number
  probability: number
}

defineProps<{
  outcomes: readonly TierOutcome[]
  percentages: readonly string[]
  remainingTotal: number
  safeProbability: number
  burstProbability: number
  estimated: boolean
}>()

const conditions: Record<Tier, string> = {
  PERFECT: '21 點',
  GREAT: '19～20 點',
  GOOD: '16～18 點',
  NORMAL: '≤15 點',
  BURST: '≥22 點',
}
</script>

<template>
  <section
    class="probability forge-panel"
    aria-labelledby="probability-title"
  >
    <div class="probability__heading">
      <div>
        <p class="eyebrow">
          {{ estimated ? '依推定牌池試算' : '下一步試算' }}
        </p>
        <h2 id="probability-title">
          再抽 1 顆，可能的結果
        </h2>
      </div>
      <span
        class="probability__deck"
        data-testid="remaining-total"
      >剩 {{ remainingTotal }}</span>
    </div>
    <p class="probability__note">
      <template v-if="estimated">
        目前牌池依補滿規則推定為 52 顆，尚未經遊戲畫面確認。
      </template>
      顯示百分比採最大餘數法調整至小數點後兩位，合計 100.00%；比例條依原始機率呈現。
      以下是理論上的下一顆機率，不代表遊戲在 21 點或爆牌後仍允許繼續抽取。
    </p>
    <ul class="probability__rows">
      <li
        v-for="(tier, index) in TIER_ORDER"
        :key="tier"
        class="probability__row"
        :data-tier="tier"
      >
        <div class="probability__labels">
          <span class="probability__tier">{{ tier }}</span>
          <span class="probability__condition">{{ conditions[tier] }}，{{ outcomes[index]?.matchingCount ?? 0 }}/{{ remainingTotal }}</span>
          <span
            class="probability__percent"
            :data-tier-probability="tier"
          >{{ percentages[index] }}%</span>
        </div>
        <div
          class="probability__track"
          role="img"
          :aria-label="`${tier} ${percentages[index]}%`"
        >
          <span
            class="probability__fill"
            :style="{ width: `${(outcomes[index]?.probability ?? 0) * 100}%` }"
          />
        </div>
      </li>
    </ul>
    <div
      class="probability__risk"
      aria-label="下一顆安全與爆牌機率"
    >
      <span>安全率 <strong>{{ (safeProbability * 100).toFixed(2) }}%</strong></span>
      <span>爆牌率 <strong>{{ (burstProbability * 100).toFixed(2) }}%</strong></span>
    </div>
  </section>
</template>

<style scoped lang="scss">
.probability { display: grid; gap: 16px; padding: 20px; }
.probability__heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.eyebrow { margin: 0 0 6px; color: var(--ash-muted); font-size: 14px; }
h2 { margin: 0; color: var(--ash); font-size: 20px; }
.probability__deck, .probability__percent { color: var(--ash); font-variant-numeric: tabular-nums; }
.probability__note { margin: -4px 0 0; color: var(--ash-muted); font-size: 13px; line-height: 1.5; }
.probability__rows { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.probability__labels { display: grid; grid-template-columns: minmax(82px, 1fr) minmax(68px, 1fr) auto; align-items: baseline; gap: 8px; }
.probability__tier { color: var(--ash); font-size: 13px; font-weight: 750; letter-spacing: .025em; }
.probability__condition { color: var(--ash-muted); font-size: 13px; }
.probability__percent { min-width: 66px; text-align: right; font-size: 15px; }
.probability__track { height: 10px; overflow: hidden; border: 1px solid var(--seam); border-radius: 2px; background: var(--soot); }
.probability__fill { display: block; height: 100%; background: var(--heat-normal); }
[data-tier='GREAT'] .probability__fill { background: var(--heat-great); }
[data-tier='GOOD'] .probability__fill { background: var(--heat-good); }
[data-tier='PERFECT'] .probability__fill { background: var(--heat-perfect); }
[data-tier='BURST'] .probability__fill { position: relative; background: var(--heat-burst); }
[data-tier='BURST'] .probability__fill::after { position: absolute; inset: 0; background: var(--soot); content: ''; opacity: .45; mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath d='M-2 8 8 -2M2 10 10 2' stroke='white' stroke-width='2'/%3E%3C/svg%3E"); mask-size: 8px 8px; }
.probability__risk { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; padding-top: 12px; border-top: 1px solid var(--seam); color: var(--ash-muted); font-size: 14px; }
.probability__risk strong { margin-left: 4px; color: var(--ash); font-variant-numeric: tabular-nums; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (max-width: 767px) { .probability { padding: 16px; } }
</style>
