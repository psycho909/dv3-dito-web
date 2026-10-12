<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { classify as tierFor, type Rank } from '../domain'
import { TIER_SCORES } from '../domain/rules'

const props = defineProps<{
  currentHand: readonly Rank[]
  currentScore: number
  recommendationLabel: string
  recommendationStop: boolean
  stopAnnouncement: string
  estimated: boolean
  finished: boolean
  active: boolean
  roundExpectation: string | null
}>()

const enteringStone = ref(false)
let entryTimer: ReturnType<typeof globalThis.setTimeout> | undefined

watch(() => props.currentHand.length, (length, previousLength) => {
  if (length < previousLength) {
    globalThis.clearTimeout(entryTimer)
    enteringStone.value = false
    return
  }
  if (length === previousLength) return
  enteringStone.value = true
  globalThis.clearTimeout(entryTimer)
  entryTimer = globalThis.setTimeout(() => { enteringStone.value = false }, 150)
})

onUnmounted(() => globalThis.clearTimeout(entryTimer))
</script>

<template>
  <section
    class="summary"
    :class="{ 'summary--entry': enteringStone }"
    :data-tier="tierFor(currentScore)"
    aria-labelledby="summary-title"
  >
    <div class="summary__heading">
      <div>
        <h2
          id="summary-title"
          class="summary__score"
          data-testid="current-score"
        >
          <span>{{ currentScore }}</span><span class="summary__limit">/21</span>
        </h2>
      </div>
      <div class="summary__details">
        <template v-if="active">
          <div class="summary__tier-line">
            <span
              class="summary__tier"
              :data-tier="tierFor(currentScore)"
            >{{ tierFor(currentScore) }}</span>
            <span class="summary__tier-score">得 {{ TIER_SCORES[tierFor(currentScore)] }} 分</span>
          </div>
          <p
            class="summary__recommendation"
            :class="{ 'summary__recommendation--stop': recommendationStop }"
          >
            <span
              v-if="recommendationStop"
              class="summary__stop-mark"
              aria-hidden="true"
            >◆</span>
            {{ estimated ? '推定牌池，' : '' }}{{ recommendationLabel }}
          </p>
          <p
            class="sr-only"
            data-testid="stop-recommendation-announcement"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ stopAnnouncement }}
          </p>
        </template>
        <template v-else>
          <div
            v-if="!finished"
            class="summary__tier-line"
          >
            <span
              class="summary__tier"
              :data-tier="tierFor(currentScore)"
            >{{ tierFor(currentScore) }}</span>
            <span class="summary__tier-score">得 {{ TIER_SCORES[tierFor(currentScore)] }} 分</span>
          </div>
          <p
            v-if="roundExpectation"
            class="summary__expectation"
            data-testid="round-expectation"
          >
            {{ roundExpectation }}
          </p>
        </template>
      </div>
    </div>
    <p
      v-if="finished"
      class="summary__finished-result"
      data-testid="round-finished-result"
    >
      本局 {{ tierFor(currentScore) }}，得 {{ TIER_SCORES[tierFor(currentScore)] }} 分
    </p>
    <div
      class="summary__hand"
      aria-label="已抽石頭"
    >
      <TransitionGroup
        name="stone-enter"
        tag="ul"
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
      </TransitionGroup>
      <p
        v-if="!currentHand.length"
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
    <p
      v-else
      class="summary__ace summary__ace--placeholder"
      aria-hidden="true"
    >
      A 會依規則採 1 或 11，自動計分。
    </p>
  </section>
</template>

<style scoped lang="scss">
.summary { display: grid; align-content: center; gap: 6px; min-width: 0; min-height: 158px; }
.summary--entry { transition: border-color 120ms ease-out; }
.summary[data-tier='BURST'] { padding: 4px 6px; border: 1px solid var(--heat-burst); border-inline-start-width: 4px; border-radius: 4px; background: var(--soot); }
.summary[data-tier='BURST'] .summary__score > span:first-child,
.summary[data-tier='BURST'] .summary__tier-score,
.summary[data-tier='BURST'] .summary__finished-result { color: var(--heat-burst); }
.summary[data-tier='BURST'] .summary__tier { border-color: var(--heat-burst); background: var(--heat-burst); color: var(--soot); }
.summary__heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 8px; min-width: 0; }
.summary__score { display: flex; align-items: baseline; gap: 4px; margin: 0; color: var(--ash); font-size: 56px; line-height: 1; font-variant-numeric: tabular-nums; }
.summary__limit { flex: 0 0 2.2em; color: var(--ash-muted); font-size: .4em; }
.summary__score > span:first-child { flex: 0 0 1.45em; text-align: right; }
.summary__details { display: grid; gap: 4px; min-width: 0; }
.summary__tier-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; }
.summary__tier { flex: 0 0 auto; padding: 3px 5px; border: 1px solid var(--seam); border-radius: 4px; color: var(--ash); font-size: 13px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; }
.summary__tier-score { color: var(--ash); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.summary__expectation { margin: 0; color: var(--ash-muted); font-size: 11px; line-height: 1.15; font-variant-numeric: tabular-nums; overflow-wrap: normal; }
.summary__recommendation { display: flex; align-items: center; gap: 6px; box-sizing: border-box; width: max-content; max-width: 100%; min-height: 30px; margin: 0; padding: 3px 7px; border: 2px solid transparent; border-radius: 4px; color: var(--ash); font-size: 14px; line-height: 1.2; white-space: nowrap; }
.summary__recommendation--stop { border-color: var(--heat-burst); background: var(--heat-burst); color: var(--soot); font-size: 15px; font-weight: 800; }
.summary__stop-mark { flex: 0 0 auto; font-size: 13px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.summary__finished-result { margin: 0; color: var(--ash); font-size: 14px; font-weight: 650; line-height: 1.2; white-space: nowrap; }
.summary__hand { display: flex; align-items: center; gap: 8px; min-width: 0; }
.summary__hand::before { flex: 0 0 auto; color: var(--ash-muted); font-size: 13px; content: '已抽'; }
.summary__chips { display: flex; flex: 1 1 auto; flex-wrap: nowrap; gap: 6px; min-width: 0; overflow-x: auto; overflow-y: hidden; margin: 0; padding: 0 2px 2px; list-style: none; }
.stone-chip { display: grid; flex: 0 0 40px; place-items: center; align-content: center; width: 40px; min-height: 46px; padding: 3px 2px; border: 1px solid var(--seam); background: var(--anvil-raised); color: var(--ash); clip-path: polygon(50% 0, 90% 18%, 90% 82%, 50% 100%, 10% 82%, 10% 18%); font-size: 17px; font-variant-numeric: tabular-nums; }
.stone-chip small { color: var(--ash-muted); font-size: 13px; }
.summary__empty, .summary__ace { margin: 0; color: var(--ash-muted); font-size: 13px; line-height: 1.2; }
.summary__ace--placeholder { visibility: hidden; }
.stone-enter-enter-active { animation: stone-arrive 120ms ease-out both; }
@keyframes stone-arrive { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 360px) {
  .summary { gap: 5px; }
  .summary__heading { gap: 4px; }
  .summary__score { font-size: 52px; }
  .summary__tier-line { gap: 4px; }
}
</style>
