<script setup lang="ts">
/* global document, Blob, URL */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { summarizeGameState } from '../services/backup'
import { useForgeStore } from '../stores/forgeStore'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useForgeStore()
const labels = {
  DISABLED: '僅本機：尚未啟用雲端備份。', CONNECTING: '正在核對雲端紀錄…',
  SAVING: '正在備份，尚未收到伺服器確認。', BACKED_UP: '目前紀錄已備份到雲端。',
  OFFLINE_PENDING: '目前離線：紀錄已存於本機，連線後再備份。',
  ERROR: '雲端尚未備份：本機紀錄仍保留。', CONFLICT: '版本衝突：已停止自動上傳；後續操作僅本機暫存。請比較雲端目前版本，本機與待送紀錄仍保留。',
}
const busy = computed(() => store.cloudWorking || store.cloudStatus === 'CONNECTING' || store.cloudStatus === 'SAVING')
const selection = ref<'local' | 'remote' | null>(null)
const remoteSummary = computed(() => store.cloudConflict?.remote?.state
  ? summarizeGameState(store.cloudConflict.remote.state) : null)
const selectionDescription = computed(() => selection.value === 'remote'
  ? '已下載的兩端備份保留原本機與待送紀錄。確認後以剛核對的雲端版本取代此裝置，不會自動合併。'
  : store.cloudConflict?.remote?.deletedAt
    ? '雲端歷史已刪除。確認後建立全新的 52 顆週期，不上傳舊歷史；伺服器確認後才替換本機。'
    : '確認後以目前本機紀錄覆蓋剛核對的雲端版本。舊待送佇列先保留，伺服器確認後才整理；不自動合併。')

function downloadConflictBackup() {
  const backup = store.exportConflictBackup()
  if (!backup) return
  let url: string | undefined
  try {
    url = URL.createObjectURL(new Blob([backup.raw], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'dito-conflict-versions-and-queue.json'
    document.body.append(link)
    link.click()
    link.remove()
    store.confirmConflictBackupDownloaded(backup.stamp)
  } catch { store.cloudMessage = '下載備份失敗；尚未允許選版，請重試。' }
  finally { if (url) globalThis.setTimeout(() => URL.revokeObjectURL(url!), 1000) }
}

async function confirmSelection() {
  const choice = selection.value
  selection.value = null
  if (choice) await store.chooseCloudVersion(choice)
}
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
    <template v-if="store.cloudStatus === 'CONFLICT' && store.cloudUserId">
      <button
        type="button"
        :disabled="busy"
        @click="store.refreshCloudConflict()"
      >
        比較兩端版本
      </button>
      <div
        v-if="store.cloudConflict"
        class="cloud-backup__comparison"
      >
        <p>本機：{{ store.backupSummary.roundCount }} 局／{{ store.backupSummary.cycleCount }} 週期，手牌 {{ store.backupSummary.currentHand.join('、') || '空' }}；最後變更 {{ store.lastLocalChangeAt || '舊版未記錄' }}。</p>
        <p v-if="remoteSummary">
          雲端：{{ remoteSummary.roundCount }} 局／{{ remoteSummary.cycleCount }} 週期，手牌 {{ remoteSummary.currentHand.join('、') || '空' }}；最後變更 {{ store.cloudConflict.remote?.updatedAt || '尚未提供' }}。
        </p>
        <p v-else>
          雲端：{{ store.cloudConflict.remote?.deletedAt ? '已刪除，保留版本墓碑' : '沒有紀錄' }}。{{ store.cloudConflict.remote?.deletedAt ? `刪除時間：${store.cloudConflict.remote.deletedAt}` : '' }}
        </p>
        <button
          type="button"
          :disabled="busy"
          @click="downloadConflictBackup"
        >
          匯出兩端與待送備份
        </button>
        <p>此封存檔包含兩端版本與原待送批次，不含認證資訊，不能直接一般匯入。需恢復時，另存 localEnvelope.session（本機）或 cloud.state（雲端）為 JSON，再用「備份與資料管理」匯入；原待送批次不自動回灌。</p>
        <button
          type="button"
          :disabled="busy || !store.conflictBackupReady || !remoteSummary"
          @click="selection = 'remote'"
        >
          保留雲端版本
        </button>
        <button
          type="button"
          :disabled="busy || !store.conflictBackupReady"
          @click="selection = 'local'"
        >
          {{ store.cloudConflict.remote?.deletedAt ? '開始新的雲端紀錄' : '保留本機版本' }}
        </button>
      </div>
    </template>
    <button
      v-if="store.cloudUserId"
      type="button"
      :disabled="busy || store.persistenceStatus !== 'READY'"
      @click="store.prepareCloudDelete()"
    >
      刪除雲端與此裝置紀錄
    </button>
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
    <ConfirmDialog
      id="cloud-version-confirm"
      :open="!!selection"
      title="確認保留版本"
      :description="selectionDescription"
      :confirm-label="selection === 'remote' ? '確認保留雲端' : store.cloudConflict?.remote?.deletedAt ? '確認開始新紀錄' : '確認保留本機'"
      :confirm-disabled="busy || !store.conflictBackupReady"
      @confirm="confirmSelection"
      @cancel="selection = null"
    />
    <ConfirmDialog
      id="cloud-delete-confirm"
      :open="!!store.cloudDeletePreview"
      title="刪除雲端與此裝置紀錄？"
      :description="`將刪除此 GitHub 帳號的遊戲歷史及此裝置紀錄（包含 ${store.pendingCloudCount} 筆待送）。無法復原，建議先匯出 JSON。伺服器仍保留最小 UID、版本與刪除時間墓碑，防止舊裝置回灌；不刪 GitHub／Auth 帳號。離線不會執行成功。`"
      confirm-label="確認刪除雲端與本機"
      :confirm-disabled="busy"
      @confirm="store.confirmCloudDelete()"
      @cancel="store.cloudDeletePreview = null"
    />
  </section>
</template>

<style scoped lang="scss">
.cloud-backup { display: grid; gap: 8px; padding: 16px; }
.cloud-backup p { margin: 0; color: var(--ash-muted); font-size: 14px; line-height: 1.6; }
.cloud-backup button { width: fit-content; min-height: 44px; padding: 10px 14px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.cloud-backup button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.cloud-backup button:disabled { opacity: .7; cursor: wait; }
.cloud-backup__comparison { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid var(--control-edge); }
</style>
