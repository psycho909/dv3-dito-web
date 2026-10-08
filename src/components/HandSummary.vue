<script setup lang="ts">
import { classify as tierFor, type Rank } from '../domain'

defineProps<{
  currentHand: readonly Rank[]
  currentScore: number
}>()

</script>

<template>
  <section
    class="summary forge-panel"
    :data-tier="tierFor(currentScore)"
    aria-labelledby="summary-title"
  >
    <div class="summary__heading">
      <div>
        <p class="eyebrow">
          本局點數
        </p>
        <h2
          id="summary-title"
          class="summary__score"
          data-testid="current-score"
        >
          <span>{{ currentScore }}</span><span class="summary__limit">/21</span>
        </h2>
      </div>
      <span
        class="summary__tier"
        :data-tier="tierFor(currentScore)"
      >{{ tierFor(currentScore) }}</span>
    </div>
    <div
      class="summary__hand"
      aria-label="已記錄的點數"
    >
      <p class="eyebrow">
        已記錄
      </p>
      <ul
        v-if="currentHand.length"
        class="summary__chips"
      >
        <li
          v-for="(rank, index) in currentHand"
          :key="`${rank}-${index}`"
          class="stone-chip"
        >
          <span>{{ rank }}</span>
          <small v-if="rank === 'A'">1/11</small>
        </li>
      </ul>
      <p
        v-else
        class="summary__empty"
      >
        尚未輸入本局抽出的石頭
      </p>
    </div>
    <p
      v-if="currentHand.includes('A')"
      class="summary__ace"
    >
      A 會依規則採 1 或 11，自動計分。
    </p>
  </section>
</template>

<style scoped lang="scss">
.summary { display: grid; gap: 20px; padding: 20px; border-left: 3px solid var(--heat-normal); }
.summary[data-tier='PERFECT'] { border-left-color: var(--heat-perfect); }
.summary[data-tier='GREAT'] { border-left-color: var(--heat-great); }
.summary[data-tier='GOOD'] { border-left-color: var(--heat-good); }
.summary[data-tier='BURST'] { border-left-color: var(--heat-burst); }
.summary__heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.eyebrow { margin: 0 0 8px; color: var(--ash-muted); font-size: 14px; }
.summary__score { display: flex; align-items: baseline; gap: 4px; margin: 0; color: var(--ash); font-size: clamp(52px, 7vw, 72px); line-height: 1; font-variant-numeric: tabular-nums; }
.summary__limit { color: var(--ash-muted); font-size: .45em; }
.summary__tier { padding: 6px 9px; border: 1px solid var(--seam); border-radius: 4px; color: var(--ash); font-size: 13px; font-weight: 700; letter-spacing: .04em; }
.summary__hand { min-width: 0; }
.summary__chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.stone-chip { display: grid; place-items: center; align-content: center; width: 44px; min-height: 54px; padding: 4px 2px; border: 1px solid var(--seam); background: var(--anvil-raised); color: var(--ash); clip-path: polygon(50% 0, 90% 18%, 90% 82%, 50% 100%, 10% 82%, 10% 18%); font-size: 18px; font-variant-numeric: tabular-nums; }
.stone-chip small { color: var(--ash-muted); font-size: 13px; }
.summary__empty, .summary__ace { margin: 0; color: var(--ash-muted); font-size: 14px; }
@media (max-width: 767px) { .summary { padding: 16px; } }
</style>
