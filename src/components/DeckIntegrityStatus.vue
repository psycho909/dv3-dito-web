<script setup lang="ts">
defineProps<{
  integrity: 'UNINITIALIZED' | 'SYNCED'
}>()

const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <section
    class="integrity forge-panel"
    aria-live="polite"
  >
    <div class="integrity__status">
      <span
        class="integrity__mark"
        aria-hidden="true"
      >◆</span>
      <span>{{ integrity === 'SYNCED' ? '記牌完整' : '尚未開始記錄' }}</span>
      <span
        v-if="integrity === 'SYNCED'"
        class="integrity__note"
      >手動追蹤</span>
    </div>
    <template v-if="integrity === 'UNINITIALIZED'">
      <p>請先確認遊戲強化石已補滿 52 顆，才能開始精確記錄。</p>
      <button
        class="button button--primary"
        type="button"
        @click="emit('confirm')"
      >
        確認從 52 顆開始記錄
      </button>
    </template>
  </section>
</template>

<style scoped lang="scss">
.integrity {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.integrity__status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ash);
  font-weight: 650;
}

.integrity__mark {
  color: var(--heat-normal);
  font-size: 13px;
}

.integrity__note,
.integrity p {
  color: var(--ash-muted);
  font-size: 14px;
}

.integrity p { margin: 0; }

.button {
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--edge-light);
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}

.button--primary {
  justify-self: start;
  color: var(--soot);
  background: var(--ash);
}

.button:hover { filter: brightness(.94); }
.button:active { transform: translateY(1px); }
.button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

</style>
