<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useForgeStore } from '../stores/forgeStore'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useForgeStore()
const labels = {
  DISABLED: '僅本機：尚未啟用雲端備份。', CONNECTING: '正在核對雲端紀錄…',
  SAVING: '正在備份，尚未收到伺服器確認。', BACKED_UP: '目前紀錄已備份到雲端。',
  OFFLINE_PENDING: '目前離線：紀錄已存於本機，連線後再備份。',
  ERROR: '雲端尚未備份：本機紀錄仍保留。', CONFLICT: '版本衝突：已停止自動上傳；後續操作僅本機暫存，本機與雲端紀錄都保留。',
}
const busy = computed(() => store.cloudStatus === 'CONNECTING' || store.cloudStatus === 'SAVING')
const summary = computed(() => store.cloudPreview?.summary)
const confirmation = computed(() => {
  const info = summary.value
  const details = info ? ` 共 ${info.roundCount} 局、${info.cycleCount} 個週期、${info.drawCount} 顆紀錄；目前手牌 ${info.currentHand.join('、') || '空'}。` : ''
  return (store.cloudPreview?.kind === 'restore'
    ? '將下載這個 GitHub 帳號的記牌紀錄到此瀏覽器，並啟用後續備份。'
    : '將上傳點數、局次、時間與牌池週期到這個 GitHub 帳號；本機仍保留紀錄。') + details
})
const retry = () => { void store.syncCloud() }
onMounted(() => {
  globalThis.addEventListener('online', retry)
  globalThis.addEventListener('offline', retry)
  globalThis.addEventListener('focus', retry)
})
onUnmounted(() => {
  globalThis.removeEventListener('online', retry)
  globalThis.removeEventListener('offline', retry)
  globalThis.removeEventListener('focus', retry)
})
</script>

<template>
  <section
    class="cloud-backup forge-panel"
    aria-label="雲端備份"
  >
    <p role="status">
      {{ labels[store.cloudStatus] }}
    </p>
    <p v-if="store.pendingCloudCount">
      待備份 {{ store.pendingCloudCount }} 筆操作
    </p>
    <p v-if="store.lastBackupAt">
      最後成功備份：{{ new Date(store.lastBackupAt).toLocaleString('zh-TW') }}
    </p>
    <p
      v-if="store.cloudMessage"
      role="alert"
    >
      {{ store.cloudMessage }}
    </p>
    <button
      v-if="store.cloudUserId && store.cloudStatus !== 'CONFLICT'"
      type="button"
      :disabled="busy || store.persistenceStatus !== 'READY'"
      @click="store.prepareCloudBackup()"
    >
      {{ store.lastBackupAt || store.pendingCloudCount ? '立即重試備份' : '啟用 GitHub 雲端備份' }}
    </button>
    <p v-if="!store.cloudUserId">
      跨裝置請登入同一個 GitHub 帳號；未登入仍可本機記牌。
    </p>
    <ConfirmDialog
      id="cloud-backup-confirm"
      :open="!!store.cloudPreview"
      title="確認雲端備份"
      :description="confirmation"
      :confirm-label="store.cloudPreview?.kind === 'restore' ? '下載並啟用備份' : '上傳並啟用備份'"
      :confirm-disabled="busy"
      @confirm="store.confirmCloudBackup()"
      @cancel="store.cloudPreview = null"
    />
  </section>
</template>

<style scoped lang="scss">
.cloud-backup { display: grid; gap: 8px; padding: 16px; }
.cloud-backup p { margin: 0; color: var(--ash-muted); font-size: 14px; line-height: 1.6; }
.cloud-backup button { width: fit-content; min-height: 44px; padding: 10px 14px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.cloud-backup button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.cloud-backup button:disabled { opacity: .7; cursor: wait; }
</style>
