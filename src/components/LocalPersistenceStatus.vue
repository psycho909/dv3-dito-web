<script setup lang="ts">
/* global HTMLHeadingElement, URL, Blob, document, setTimeout */
import { ref } from 'vue'

const props = defineProps<{ error: string; rawData: string | null }>()
const emit = defineEmits<{ retry: [] }>()
const title = ref<HTMLHeadingElement>()
const downloadError = ref('')

function focusError() { title.value?.focus() }
defineExpose({ focusError })

function downloadRaw() {
  if (props.rawData === null) return
  let url: string | undefined
  try {
    url = URL.createObjectURL(new Blob([props.rawData], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'dito-forge-local-recovery.txt'
    document.body.append(link)
    link.click()
    link.remove()
    downloadError.value = ''
  } catch {
    downloadError.value = '無法下載原始資料；請保留此頁與瀏覽器資料，再嘗試下載。'
  } finally {
    if (url) {
      const objectUrl = url
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    }
  }
}
</script>

<template>
  <section
    class="local-recovery forge-panel"
    aria-labelledby="local-recovery-title"
  >
    <h2
      id="local-recovery-title"
      ref="title"
      tabindex="-1"
    >
      本機資料暫時無法使用
    </h2>
    <p role="alert">
      {{ error }}
    </p>
    <p>已停止記牌與儲存，未清空或覆寫原始資料。請先保留原始資料，勿清除瀏覽器儲存空間。</p>
    <p>重新讀取會載入此裝置目前的有效紀錄；不會重新執行失敗的操作。</p>
    <p v-if="rawData !== null">
      下載內容是本頁最後取得的原始資料，不會修正內容，也不保證是其他分頁更新後的最新版本。
    </p>
    <div class="local-recovery__actions">
      <button
        v-if="rawData !== null"
        type="button"
        @click="downloadRaw"
      >
        下載原始資料
      </button>
      <button
        type="button"
        @click="emit('retry')"
      >
        重新讀取本機資料
      </button>
    </div>
    <p v-if="rawData === null">
      目前無法取得可下載的原始資料；請檢查瀏覽器儲存權限後再重新讀取。
    </p>
    <p
      v-if="downloadError"
      role="alert"
    >
      {{ downloadError }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.local-recovery { display: grid; gap: 12px; padding: 16px; border-color: var(--heat-burst); }
.local-recovery h2 { margin: 0; font-size: 18px; line-height: 1.5; }
.local-recovery p { margin: 0; color: var(--ash-muted); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.local-recovery__actions { display: flex; flex-wrap: wrap; gap: 12px; }
.local-recovery button { min-width: 44px; min-height: 44px; padding: 10px 14px; border: 1px solid var(--edge-light); border-radius: 8px; background: var(--anvil-raised); color: var(--ash); cursor: pointer; }
.local-recovery button:hover { filter: brightness(1.08); }
.local-recovery button:active { transform: translateY(1px); }
.local-recovery button:focus-visible,
.local-recovery h2:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
</style>
