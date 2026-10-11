<script setup lang="ts">
/* global HTMLInputElement */
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  verifiedRemainingCount: number | null
  toolRemaining?: number
  integrity?: 'SYNCED' | 'UNSYNCED'
}>(), { toolRemaining: 52, integrity: 'SYNCED' })

const emit = defineEmits<{
  verify: [remaining: number]
}>()

const value = ref('')
const error = ref('')
const input = ref<HTMLInputElement>()
const result = computed(() => {
  if (props.verifiedRemainingCount === null) return ''
  if (props.integrity === 'UNSYNCED') {
    return `遊戲核對目標 ${props.verifiedRemainingCount} 顆，工具依紀錄推算 ${props.toolRemaining} 顆。牌池未同步，請修復點數紀錄後重新核對遊戲當下剩餘數，或確認新週期補滿。`
  }
  return `核對相符：遊戲與工具皆剩 ${props.verifiedRemainingCount} 顆。`
})

function submit() {
  if (!/^\d+$/.test(value.value.trim())) {
    error.value = '請輸入 0 到 52 的整數。'
    input.value?.focus()
    return
  }

  const remaining = Number(value.value)
  if (remaining > 52) {
    error.value = '請輸入 0 到 52 的整數。'
    input.value?.focus()
    return
  }

  error.value = ''
  emit('verify', remaining)
}
</script>

<template>
  <details class="remaining-verification forge-panel">
    <summary>
      核對遊戲剩餘顆數
      <span v-if="verifiedRemainingCount !== null">核對目標 {{ verifiedRemainingCount }} 顆</span>
    </summary>
    <form
      novalidate
      @submit.prevent="submit"
    >
      <label for="game-remaining-count">遊戲畫面目前剩幾顆？</label>
      <div class="remaining-verification__entry">
        <input
          id="game-remaining-count"
          ref="input"
          v-model="value"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? 'game-remaining-help game-remaining-error' : 'game-remaining-help'"
        >
        <button type="submit">
          核對
        </button>
      </div>
      <p
        v-if="error"
        id="game-remaining-error"
        class="remaining-verification__error"
        role="alert"
      >
        {{ error }}
      </p>
      <p
        id="game-remaining-help"
        class="remaining-verification__help"
      >
        請依遊戲畫面輸入 0 到 52 的整數；核對不會修改抽取記錄。
        <span v-if="integrity === 'UNSYNCED' && verifiedRemainingCount !== null">未同步期間保留原核對目標，其他數字不會覆寫；請先修復紀錄，再重新核對。</span>
      </p>
    </form>
    <p
      class="remaining-verification__result"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ result }}
    </p>
  </details>
</template>

<style scoped lang="scss">
.remaining-verification { min-width: 0; padding: 14px 16px; }
summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; color: var(--ash); font-weight: 650; cursor: pointer; }
summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
summary:hover { color: var(--heat-perfect); }
summary:active { color: var(--ash-muted); }
summary span { color: var(--ash-muted); font-size: 14px; font-weight: 400; }
form { display: grid; gap: 10px; padding-top: 14px; }
label { color: var(--ash); }
.remaining-verification__entry { display: flex; flex-wrap: wrap; gap: 8px; }
input { flex: 1 1 120px; min-width: 0; min-height: 44px; padding: 8px 10px; border: 1px solid var(--seam); border-radius: 6px; background: var(--soot); color: var(--ash); font: inherit; font-variant-numeric: tabular-nums; }
button { min-width: 76px; min-height: 44px; padding: 8px 14px; border: 1px solid var(--edge-light); border-radius: 6px; background: var(--ash); color: var(--soot); font: inherit; font-weight: 650; cursor: pointer; }
button:hover { filter: brightness(.94); }
button:active { transform: translateY(1px); }
input:focus-visible, button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.remaining-verification__error { margin: 0; color: var(--heat-burst); }
.remaining-verification__help { margin: 0; color: var(--ash-muted); font-size: 13px; line-height: 1.5; }
.remaining-verification__result { margin: 0; color: var(--ash-muted); font-size: 14px; line-height: 1.5; }
</style>
