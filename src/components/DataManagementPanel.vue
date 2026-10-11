<script setup lang="ts">
/* global HTMLInputElement, HTMLButtonElement, Event */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { MAX_BACKUP_BYTES, type BackupSummary, type ImportPreview } from '../services/backup'

const props = defineProps<{
  disabled: boolean
  initialized: boolean
  currentSummary: BackupSummary
  importPreview: ImportPreview | null
  notice?: string
}>()

const emit = defineEmits<{
  export: []
  previewImport: [raw: string, fileName: string]
  applyImport: []
  cancelImport: []
  resetDeck: []
  clearLocal: []
}>()

type ConfirmMode = 'import' | 'reset' | 'clear'

const fileInput = ref<HTMLInputElement>()
const exportButton = ref<HTMLButtonElement>()
const importButton = ref<HTMLButtonElement>()
const resetButton = ref<HTMLButtonElement>()
const clearButton = ref<HTMLButtonElement>()
const selectedFileName = ref('')
const reading = ref(false)
const fileError = ref('')
const confirmMode = ref<ConfirmMode | null>(null)
const applying = ref(false)
let readVersion = 0

const canMutate = computed(() => !props.disabled)
const canExport = computed(() => canMutate.value && props.initialized)
const canApplyImport = computed(() => canMutate.value && !reading.value && props.importPreview?.ok === true)
const currentSummary = computed(() => props.currentSummary)

const confirmation = computed(() => {
  switch (confirmMode.value) {
    case 'import':
      return {
        title: '覆蓋本機紀錄？',
        description: '建議先匯出目前資料；將以備份覆蓋此裝置紀錄，不會合併。',
        confirmLabel: '確認覆蓋本機紀錄',
      }
    case 'reset':
      return {
        title: '重置為 52 顆牌池？',
        description: '請先確認遊戲已補滿 52 顆。這會結束目前回合並開始空手牌的新局，舊回合與歷史都會保留。',
        confirmLabel: '確認遊戲已補滿並重置',
      }
    case 'clear':
      return {
        title: '清除此裝置紀錄？',
        description: '只會清除此工具在這個瀏覽器的本機紀錄，不會清除雲端或其他網站資料。此操作無法復原，建議先匯出備份。',
        confirmLabel: '確認清除此裝置資料',
      }
    default:
      return null
  }
})

function formatSummary(summary: BackupSummary) {
  return [
    `回合 ${summary.roundCount} 局`,
    `週期 ${summary.cycleCount} 個`,
    `抽牌 ${summary.drawCount} 顆`,
    `目前手牌 ${summary.currentHand.length ? summary.currentHand.join('、') : '空'}`,
    `剩餘牌池 ${summary.remainingTotal} 顆`,
    `可信度 ${summary.syncState}`,
  ]
}

function clearSelection(emitCancel = true) {
  readVersion += 1
  reading.value = false
  selectedFileName.value = ''
  fileError.value = ''
  if (fileInput.value) fileInput.value.value = ''
  if (emitCancel) emit('cancelImport')
}

async function readSelection(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const version = ++readVersion
  emit('cancelImport')
  selectedFileName.value = file.name
  fileError.value = ''
  reading.value = false

  if (file.size > MAX_BACKUP_BYTES) {
    fileError.value = '備份檔超過 5 MiB，請選擇較小的檔案。'
    await nextTick()
    fileInput.value?.focus()
    return
  }

  reading.value = true
  try {
    const raw = await file.text()
    if (version !== readVersion) return
    reading.value = false
    emit('previewImport', raw, file.name)
  } catch {
    if (version !== readVersion) return
    reading.value = false
    fileError.value = '無法讀取這個檔案，請重新選取或檢查檔案是否可讀。'
    await nextTick()
    fileInput.value?.focus()
  }
}

function openConfirmation(mode: ConfirmMode) {
  if (!canMutate.value || applying.value) return
  if (mode === 'import' && !canApplyImport.value) return
  if (mode === 'reset' && !props.initialized) return
  confirmMode.value = mode
}

async function confirmAction() {
  const mode = confirmMode.value
  if (!mode || applying.value || !canMutate.value) return
  if (mode === 'import' && !canApplyImport.value) return

  applying.value = true
  confirmMode.value = null
  clearSelection(false)
  if (mode === 'import') emit('applyImport')
  else if (mode === 'reset') emit('resetDeck')
  else emit('clearLocal')
  await nextTick()
  applying.value = false
  if (mode === 'reset') exportButton.value?.focus()
  else fileInput.value?.focus()
}

watch(() => props.disabled, (disabled) => {
  if (!disabled) return
  readVersion += 1
  reading.value = false
  confirmMode.value = null
  applying.value = false
})

watch(() => props.importPreview, async (preview) => {
  if (preview?.ok !== false) return
  await nextTick()
  fileInput.value?.focus()
}, { flush: 'post', immediate: true })

onBeforeUnmount(() => {
  readVersion += 1
})
</script>

<template>
  <details
    class="data-management forge-panel"
    data-management
  >
    <summary>備份與資料管理</summary>
    <section
      class="data-management__content"
      aria-labelledby="data-management-title"
    >
      <h2 id="data-management-title">
        本機備份與資料
      </h2>
      <p class="data-management__intro">
        備份只包含遊戲紀錄，不含裝置識別或雲端資料。單一 JSON 檔上限 5 MiB。
      </p>

      <div class="data-management__safe-actions">
        <button
          ref="exportButton"
          class="data-management__button data-management__button--primary"
          type="button"
          :disabled="!canExport || applying"
          @click="emit('export')"
        >
          匯出 JSON 備份
        </button>

        <div class="data-management__import">
          <label for="backup-file">選擇 JSON 備份</label>
          <input
            id="backup-file"
            ref="fileInput"
            type="file"
            accept=".json,application/json"
            :disabled="!canMutate || applying"
            :aria-invalid="fileError || (importPreview?.ok === false) ? 'true' : undefined"
            :aria-describedby="fileError || importPreview?.ok === false ? 'backup-file-help backup-file-error' : 'backup-file-help'"
            @change="readSelection"
          >
          <p
            id="backup-file-help"
            class="data-management__help"
          >
            選取後會在此裝置檢查並預覽內容；不會上傳。
          </p>
          <p
            v-if="selectedFileName"
            class="data-management__filename"
          >
            已選取：{{ selectedFileName }}
          </p>
          <p
            v-if="reading"
            class="data-management__status"
            role="status"
            aria-live="polite"
          >
            正在讀取備份…
          </p>
          <p
            v-if="fileError"
            id="backup-file-error"
            class="data-management__error"
            role="alert"
          >
            {{ fileError }}
          </p>
          <p
            v-else-if="importPreview?.ok === false"
            id="backup-file-error"
            class="data-management__error"
            data-import-preview
            role="alert"
          >
            {{ importPreview.error }}
          </p>
          <button
            v-if="selectedFileName || importPreview"
            ref="importButton"
            class="data-management__button"
            type="button"
            :disabled="!canMutate || applying"
            @click="clearSelection()"
          >
            移除選取備份
          </button>
          <button
            v-if="importPreview?.ok"
            class="data-management__button data-management__button--apply"
            type="button"
            :disabled="!canApplyImport || applying"
            @click="openConfirmation('import')"
          >
            套用匯入備份
          </button>
        </div>
      </div>

      <section
        v-if="importPreview?.ok"
        class="data-management__preview"
        aria-labelledby="backup-preview-title"
        data-import-preview
      >
        <h3 id="backup-preview-title">
          備份內容預覽
        </h3>
        <p>套用會完整覆蓋此裝置紀錄，不會合併；目前資料與備份內容如下。</p>
        <div class="data-management__comparison">
          <article>
            <h4>此裝置目前紀錄</h4>
            <ul>
              <li
                v-for="line in formatSummary(currentSummary)"
                :key="line"
              >
                {{ line }}
              </li>
            </ul>
          </article>
          <article>
            <h4>備份：{{ importPreview.fileName }}</h4>
            <ul>
              <li
                v-for="line in formatSummary(importPreview.incoming)"
                :key="line"
              >
                {{ line }}
              </li>
            </ul>
          </article>
        </div>
      </section>

      <p
        v-if="notice"
        class="data-management__notice"
        role="status"
        aria-live="polite"
      >
        {{ notice }}
      </p>

      <section
        class="data-management__danger"
        aria-labelledby="local-actions-title"
      >
        <h3 id="local-actions-title">
          重置與清除
        </h3>
        <p>這些操作會變更或移除此裝置的紀錄，請先確認影響。</p>
        <div class="data-management__danger-actions">
          <button
            ref="resetButton"
            class="data-management__button data-management__button--danger"
            type="button"
            :disabled="!canMutate || !initialized || applying"
            @click="openConfirmation('reset')"
          >
            重置牌池
          </button>
          <button
            ref="clearButton"
            class="data-management__button data-management__button--danger"
            type="button"
            :disabled="!canMutate || applying"
            @click="openConfirmation('clear')"
          >
            只清除此裝置資料
          </button>
        </div>
      </section>

      <ConfirmDialog
        id="data-management-confirm"
        :open="Boolean(confirmMode) && !disabled"
        :title="confirmation?.title ?? ''"
        :description="confirmation?.description ?? ''"
        :confirm-label="confirmation?.confirmLabel ?? ''"
        @cancel="confirmMode = null"
        @confirm="confirmAction"
      />
    </section>
  </details>
</template>

<style scoped lang="scss">
.data-management { min-width: 0; padding: 0 16px; }
.data-management > summary { display: flex; align-items: center; min-height: 48px; color: var(--ash); font-weight: 650; cursor: pointer; }
.data-management > summary:hover { color: var(--ash); }
.data-management > summary:active { color: var(--ash-muted); }
.data-management > summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.data-management__content { display: grid; gap: 14px; min-width: 0; padding: 0 0 16px; }
.data-management h2, .data-management h3, .data-management h4 { margin: 0; color: var(--ash); }
.data-management h2 { font-size: 18px; line-height: 1.4; }
.data-management h3 { font-size: 16px; line-height: 1.45; }
.data-management h4 { font-size: 14px; line-height: 1.45; }
.data-management p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
.data-management__intro, .data-management__help, .data-management__preview > p, .data-management__danger > p { color: var(--ash-muted); }
.data-management__safe-actions { display: grid; gap: 16px; }
.data-management__import { display: grid; align-items: start; gap: 8px; min-width: 0; }
.data-management__import label, .data-management__import p { min-height: 24px; }
.data-management__import label { color: var(--ash); font-weight: 600; }
.data-management input[type='file'] { width: 100%; min-width: 0; min-height: 44px; color: var(--ash); font: inherit; }
.data-management input[type='file']::file-selector-button { min-width: 44px; min-height: 44px; margin-right: 10px; padding: 8px 12px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.data-management input[type='file']::file-selector-button:hover { filter: brightness(1.1); }
.data-management__filename { color: var(--ash); overflow-wrap: anywhere; }
.data-management__status { color: var(--ash-muted); }
.data-management__error { color: var(--ash); }
.data-management__button { min-width: 44px; min-height: 44px; width: max-content; max-width: 100%; padding: 8px 12px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil-raised); color: var(--ash); font: inherit; text-align: left; overflow-wrap: anywhere; cursor: pointer; }
.data-management__button:hover:not(:disabled) { filter: brightness(1.1); }
.data-management__button:active:not(:disabled) { filter: brightness(.92); transform: translateY(1px); }
.data-management__button:focus-visible, .data-management input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.data-management__button:disabled, .data-management input:disabled { opacity: .5; cursor: not-allowed; }
.data-management__button--primary { border-color: var(--control-edge); background: var(--ash); color: var(--soot); font-weight: 650; }
.data-management__button--apply { border-color: var(--heat-great); }
.data-management__preview, .data-management__danger { display: grid; gap: 10px; min-width: 0; padding: 14px; border: 1px solid var(--seam); border-radius: 8px; background: var(--soot); }
.data-management__comparison { display: grid; gap: 12px; min-width: 0; }
.data-management__comparison article { min-width: 0; padding-top: 10px; border-top: 1px solid var(--seam); }
.data-management__comparison ul { display: grid; gap: 5px; margin: 8px 0 0; padding-left: 20px; color: var(--ash-muted); font-size: 14px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.data-management__notice { color: var(--ash); }
.data-management__danger { border-color: color-mix(in srgb, var(--heat-burst), var(--seam) 45%); }
.data-management__danger-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.data-management__button--danger { border-color: var(--heat-burst); }
@media (min-width: 600px) { .data-management__safe-actions { grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); align-items: start; } .data-management__comparison { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
