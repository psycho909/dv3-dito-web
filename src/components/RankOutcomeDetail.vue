<script setup lang="ts">
import { ref } from 'vue'
import type { Rank, Tier } from '../domain'

type Outcome = { rank: Rank; remainingCount: number; probability: number; nextScore: number; tier: Tier }

defineProps<{ outcomes: readonly Outcome[]; remainingTotal: number }>()
const expanded = ref(false)
</script>

<template>
  <section
    class="rank-detail forge-panel"
    aria-label="逐點數抽牌結果"
  >
    <button
      class="rank-detail__toggle"
      type="button"
      :aria-expanded="expanded"
      :aria-controls="expanded ? 'rank-outcome-list' : undefined"
      :aria-label="expanded ? '收合逐點數明細' : '展開逐點數明細'"
      @click="expanded = !expanded"
    >
      <span>{{ expanded ? '收合' : '展開' }}逐點數明細</span>
      <span aria-hidden="true">{{ expanded ? '−' : '+' }}</span>
    </button>
    <div
      v-if="expanded"
      id="rank-outcome-list"
      class="rank-detail__content"
      role="region"
      aria-label="逐點數結果明細"
    >
      <div
        class="rank-detail__head"
        aria-hidden="true"
      >
        <span>點數</span><span>剩餘</span><span>下張機率</span><span>抽後點數</span><span>等級</span>
      </div>
      <ol class="rank-detail__list">
        <li
          v-for="outcome in outcomes"
          :key="outcome.rank"
          class="rank-detail__row"
          :data-rank-outcome="outcome.rank"
        >
          <strong class="rank-detail__rank">{{ outcome.rank }}</strong>
          <span><span class="rank-detail__label">剩餘 </span>{{ outcome.remainingCount }}/{{ remainingTotal }}</span>
          <span><span class="rank-detail__label">機率 </span>{{ (outcome.probability * 100).toFixed(2) }}%</span>
          <span><span class="rank-detail__label">抽後 </span>{{ outcome.nextScore }}</span>
          <span
            class="rank-detail__tier"
            :data-tier="outcome.tier"
          >{{ outcome.tier }}</span>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped lang="scss">
.rank-detail { min-width: 0; overflow: hidden; }
.rank-detail__toggle { display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border: 0; background: transparent; color: var(--ash); text-align: left; font: inherit; cursor: pointer; }
.rank-detail__toggle:hover { background: color-mix(in srgb, var(--anvil-raised), transparent 35%); }
.rank-detail__toggle:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
.rank-detail__content { padding: 0 16px 16px; }
.rank-detail__head, .rank-detail__row { display: grid; grid-template-columns: minmax(30px, .6fr) minmax(54px, 1fr) minmax(75px, 1.2fr) minmax(72px, 1fr) minmax(66px, .9fr); align-items: center; gap: 8px; }
.rank-detail__head { min-height: 36px; border-bottom: 1px solid var(--seam); color: var(--ash-muted); font-size: 12px; }
.rank-detail__list { display: grid; margin: 0; padding: 0; list-style: none; }
.rank-detail__row { min-height: 40px; border-bottom: 1px solid color-mix(in srgb, var(--seam), transparent 35%); color: var(--ash); font-size: 13px; font-variant-numeric: tabular-nums; }
.rank-detail__rank { font-size: 14px; }
.rank-detail__tier { font-weight: 700; }
[data-tier='GOOD'] { color: var(--heat-good); } [data-tier='GREAT'] { color: var(--heat-great); } [data-tier='PERFECT'] { color: var(--heat-perfect); } [data-tier='BURST'] { color: var(--heat-burst); }
.rank-detail__label { display: none; color: var(--ash-muted); }
@media (max-width: 600px) {
  .rank-detail__head { display: none; }
  .rank-detail__list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding-top: 12px; }
  .rank-detail__row { grid-template-columns: minmax(22px, .55fr) minmax(0, 1fr); gap: 4px 8px; min-width: 0; padding: 8px; border: 1px solid var(--seam); border-radius: 6px; font-size: 12px; }
  .rank-detail__row > span { min-width: 0; overflow-wrap: anywhere; }
  .rank-detail__label { display: inline; }
}
@media (max-width: 340px) { .rank-detail__list { grid-template-columns: minmax(0, 1fr); } }
</style>
