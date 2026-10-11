<script setup lang="ts">
/* global Event, MouseEvent, BeforeUnloadEvent, window, HTMLDialogElement, HTMLButtonElement, HTMLInputElement, HTMLFormElement, HTMLTextAreaElement */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { classify, RANKS, score, type Deck, type Rank } from '../domain'
import type { DeckCycle, RoundRecord } from '../domain/gameReducer'
import type { HistoryCorrection, HistoryEdit, HistoryPreview } from '../domain/historyCorrection'

const props = withDefaults(defineProps<{
  open: boolean
  rounds: readonly RoundRecord[]
  cycles: readonly DeckCycle[]
  corrections?: readonly HistoryCorrection[]
  preview: HistoryPreview | null
  notice?: string
}>(), { corrections: () => [], notice: '' })

const emit = defineEmits<{
  close: []
  preview: [edit: HistoryEdit]
  apply: []
  cancelPreview: []
}>()

const PAGE_SIZE = 10
const dialog = ref<HTMLDialogElement>()
const closeButton = ref<HTMLButtonElement>()
const discardContinueButton = ref<HTMLButtonElement>()
const formElement = ref<HTMLFormElement>()
const sequenceField = ref<HTMLTextAreaElement>()
const reasonField = ref<HTMLInputElement>()
const page = ref(0)
const selectedRoundId = ref<string | null>(null)
const sequenceText = ref('')
const reason = ref('')
const validationError = ref('')
const invalidField = ref<'sequence' | 'reason' | null>(null)
const showDiscardPrompt = ref(false)
let editTrigger: HTMLButtonElement | null = null

const orderedRounds = computed(() => [...props.rounds])
const pageCount = computed(() => Math.max(1, Math.ceil(orderedRounds.value.length / PAGE_SIZE)))
const currentPage = computed(() => Math.min(page.value, pageCount.value - 1))
const pageRounds = computed(() => {
  const end = orderedRounds.value.length - currentPage.value * PAGE_SIZE
  return orderedRounds.value.slice(Math.max(0, end - PAGE_SIZE), end).reverse()
})
const pageRoundIds = computed(() => new Set(pageRounds.value.map((round) => round.id)))
const pageCorrections = computed(() => props.corrections
  .filter((correction) => pageRoundIds.value.has(correction.roundId))
  .slice()
  .reverse())
const selectedRound = computed(() => props.rounds.find((round) => round.id === selectedRoundId.value))
const failedPreview = computed(() => props.preview?.ok === false ? props.preview : null)
const failedPreviewRoundLabel = computed(() => {
  const roundId = failedPreview.value?.conflictRoundId ?? selectedRoundId.value
  if (!roundId) return ''
  return `（衝突於第 ${props.rounds.findIndex((round) => round.id === roundId) + 1} 局）`
})
const failedPreviewMessage = computed(() => failedPreview.value
  ? `${failedPreview.value.error}${failedPreviewRoundLabel.value}` : '')
const hasDraft = computed(() => selectedRoundId.value !== null && (sequenceText.value !== (selectedRound.value?.draws.join(' ') ?? '') || reason.value.length > 0))
const hasUncommittedWork = computed(() => hasDraft.value || props.preview !== null)
const pageLabel = computed(() => `${currentPage.value + 1} / ${pageCount.value}`)

function remainingAtStart(round: RoundRecord): number {
  const cycle = props.cycles.find((item) => item.id === round.cycleId)
  if (!cycle) return 0
  return Math.max(0, Object.values(cycle.initialDeck).reduce((sum, count) => sum + count, 0)
    - props.rounds.filter((item) => item.cycleId === round.cycleId && props.rounds.indexOf(item) < props.rounds.indexOf(round))
      .reduce((sum, item) => sum + item.draws.length, 0))
}

function remainingAtEnd(round: RoundRecord): number {
  return Math.max(0, remainingAtStart(round) - round.draws.length)
}

function openEditor(round: RoundRecord, event: MouseEvent) {
  editTrigger = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null
  selectedRoundId.value = round.id
  sequenceText.value = round.draws.join(' ')
  reason.value = ''
  validationError.value = ''
  invalidField.value = null
  emit('cancelPreview')
  void nextTick(() => sequenceField.value?.focus())
}

function parseSequence(input: string): Rank[] | null {
  const trimmed = input.trim()
  if (!trimmed) return []
  const parts = trimmed.split(/[\s,，]+/)
  if (parts.some((part) => !RANKS.includes(part as Rank))) return null
  return parts as Rank[]
}

function submitEdit() {
  if (!selectedRound.value) return
  const draws = parseSequence(sequenceText.value)
  if (!draws) {
    validationError.value = '請輸入有效點數：A、2 到 10，可用空格或逗號分隔。'
    invalidField.value = 'sequence'
    void nextTick(() => sequenceField.value?.focus())
    return
  }
  if (reason.value.trim().length < 1 || reason.value.trim().length > 500) {
    validationError.value = '請輸入 1 到 500 字的修正原因。'
    invalidField.value = 'reason'
    void nextTick(() => reasonField.value?.focus())
    return
  }
  validationError.value = ''
  invalidField.value = null
  emit('preview', { roundId: selectedRound.value.id, draws, reason: reason.value.trim() })
}

function abandonEdit() {
  selectedRoundId.value = null
  sequenceText.value = ''
  reason.value = ''
  validationError.value = ''
  invalidField.value = null
  showDiscardPrompt.value = false
  emit('cancelPreview')
}

function requestClose() {
  if (hasDraft.value || props.preview) {
    showDiscardPrompt.value = true
    void nextTick(() => discardContinueButton.value?.focus())
    return
  }
  dialog.value?.close()
  emit('close')
}

function continueEditing() {
  showDiscardPrompt.value = false
  void nextTick(() => (selectedRoundId.value ? sequenceField.value?.focus() : closeButton.value?.focus()))
}

function discardAndClose() {
  abandonEdit()
  dialog.value?.close()
  emit('close')
}

function handleCancel(event: Event) {
  event.preventDefault()
  requestClose()
}

function previousPage() { page.value = Math.max(0, currentPage.value - 1) }
function nextPage() { page.value = Math.min(pageCount.value - 1, currentPage.value + 1) }
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  }).format(date)
}

function guardUnsavedUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}

watch(hasUncommittedWork, (hasWork) => {
  window.removeEventListener('beforeunload', guardUnsavedUnload)
  if (hasWork) window.addEventListener('beforeunload', guardUnsavedUnload)
}, { flush: 'sync' })
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnsavedUnload))

watch(() => props.rounds.length, () => { page.value = 0 }, { immediate: true })
watch(() => props.open, async (open) => {
  await nextTick()
  const element = dialog.value
  if (!element) return
  if (open && !element.open) {
    element.showModal()
    closeButton.value?.focus()
  } else if (!open && element.open) element.close()
}, { flush: 'post', immediate: true })
watch(() => props.preview, (preview) => {
  if (preview?.ok) {
    validationError.value = ''
    invalidField.value = null
  }
}, { deep: true })
watch(() => ({ preview: props.preview, notice: props.notice }), async (state, previous) => {
  if (!state.notice?.startsWith('已套用修正')) return
  const applied = previous.preview !== null && state.preview === null
  const noticeChanged = state.notice !== previous.notice && state.preview === null
  if (!applied && !noticeChanged) return
  const focusRoundId = selectedRoundId.value
  const originalTrigger = editTrigger
  selectedRoundId.value = null
  sequenceText.value = ''
  reason.value = ''
  validationError.value = ''
  invalidField.value = null
  showDiscardPrompt.value = false
  await nextTick()
  const target = originalTrigger?.isConnected ? originalTrigger : [...(dialog.value?.querySelectorAll<HTMLButtonElement>('[data-history-edit]') ?? [])]
    .find((button) => button.dataset.historyEdit === focusRoundId)
  ;(target ?? closeButton.value)?.focus()
  editTrigger = null
})

const rankLabels: readonly Rank[] = RANKS
function deckTotal(deck: Deck) { return rankLabels.reduce((total, rank) => total + deck[rank], 0) }
</script>

<template>
  <dialog
    ref="dialog"
    class="history-drawer forge-panel"
    aria-labelledby="history-title"
    @cancel="handleCancel"
  >
    <header class="history-drawer__header">
      <div>
        <p class="history-drawer__eyebrow">
          回合紀錄與修正
        </p>
        <h2 id="history-title">
          歷史紀錄
        </h2>
      </div>
      <button
        ref="closeButton"
        class="history-drawer__button history-drawer__close"
        type="button"
        aria-label="關閉歷史紀錄"
        @click="requestClose"
      >
        關閉
      </button>
    </header>

    <p
      v-if="notice"
      class="history-drawer__notice"
      role="status"
    >
      {{ notice }}
    </p>
    <section
      class="history-drawer__rounds"
      aria-label="所有回合"
    >
      <template v-if="pageRounds.length">
        <template
          v-for="(round, index) in pageRounds"
          :key="round.id"
        >
          <section
            v-if="index === 0 || pageRounds[index - 1]?.cycleId !== round.cycleId"
            class="history-drawer__cycle"
            :data-cycle-id="round.cycleId"
          >
            <strong>牌池週期 {{ cycles.findIndex((cycle) => cycle.id === round.cycleId) + 1 }}</strong>
            <span v-if="cycles.find((cycle) => cycle.id === round.cycleId)?.previousRemaining !== undefined">前週期剩 {{ cycles.find((cycle) => cycle.id === round.cycleId)?.previousRemaining }} 張</span>
            <span v-if="cycles.find((cycle) => cycle.id === round.cycleId)?.reason === 'BELOW_15_NEXT_ROUND'">推定補滿</span>
            <span v-if="cycles.find((cycle) => cycle.id === round.cycleId)?.observation">{{ cycles.find((cycle) => cycle.id === round.cycleId)?.observation === 'CONFIRMED_52' ? '已確認為 52 張' : '已否認為 52 張' }}</span>
            <span v-else-if="cycles.find((cycle) => cycle.id === round.cycleId)?.reason === 'BELOW_15_NEXT_ROUND'">尚未確認</span>
          </section>
          <article
            class="history-drawer__round"
            :data-round-id="round.id"
            :data-history-round="round.id"
          >
            <div class="history-drawer__round-heading">
              <h3>第 {{ rounds.indexOf(round) + 1 }} 局</h3>
              <span
                class="history-drawer__status"
                :data-status="round.status"
              >{{ round.status === 'ACTIVE' ? '進行中' : '已完成' }}</span>
              <button
                class="history-drawer__button history-drawer__edit"
                type="button"
                :data-history-edit="round.id"
                :aria-label="`修正第 ${rounds.indexOf(round) + 1} 局`"
                @click="openEditor(round, $event)"
              >
                修正
              </button>
            </div>
            <p
              class="history-drawer__draws"
              aria-label="抽牌序列"
            >
              {{ round.draws.length ? round.draws.join('、') : '空局' }}
            </p>
            <p class="history-drawer__summary">
              分數 {{ score(round.draws) }} · {{ classify(score(round.draws)) }} <span>剩餘 {{ remainingAtStart(round) }} → {{ remainingAtEnd(round) }}</span>
            </p>
          </article>
        </template>
      </template>
      <p
        v-else
        class="history-drawer__empty"
      >
        尚無回合紀錄。
      </p>
    </section>

    <nav
      v-if="rounds.length > PAGE_SIZE"
      class="history-drawer__pagination"
      aria-label="歷史分頁"
    >
      <button
        class="history-drawer__button"
        type="button"
        :disabled="currentPage === 0"
        @click="previousPage"
      >
        較新紀錄
      </button>
      <span>第 {{ pageLabel }} 頁 · 共 {{ rounds.length }} 局</span>
      <button
        class="history-drawer__button"
        type="button"
        :disabled="currentPage >= pageCount - 1"
        @click="nextPage"
      >
        更舊紀錄
      </button>
    </nav>
    <p
      v-else-if="rounds.length"
      class="history-drawer__count"
    >
      共 {{ rounds.length }} 局
    </p>

    <section
      v-if="selectedRound"
      class="history-drawer__editor"
      aria-labelledby="history-editor-title"
    >
      <h3 id="history-editor-title">
        修正第 {{ rounds.indexOf(selectedRound) + 1 }} 局
      </h3>
      <form
        ref="formElement"
        novalidate
        @submit.prevent="submitEdit"
      >
        <label for="history-sequence">抽牌序列</label>
        <textarea
          id="history-sequence"
          ref="sequenceField"
          v-model="sequenceText"
          rows="3"
          style="resize: none"
          aria-label="抽牌序列"
          :aria-describedby="invalidField === 'sequence' ? 'history-sequence-help history-error' : 'history-sequence-help'"
          :aria-invalid="invalidField === 'sequence' ? 'true' : undefined"
          spellcheck="false"
        />
        <small id="history-sequence-help">輸入修正後完整順序，例如 A 10；可用空格或逗號分隔，也可留空表示空局。</small>
        <label for="history-reason">修正原因</label>
        <input
          id="history-reason"
          ref="reasonField"
          v-model="reason"
          aria-label="修正原因"
          maxlength="500"
          :aria-invalid="invalidField === 'reason' ? 'true' : undefined"
          :aria-describedby="invalidField === 'reason' ? 'history-reason-help history-error' : 'history-reason-help'"
        >
        <small id="history-reason-help">必填，1 到 500 字。</small>
        <p
          v-if="validationError"
          id="history-error"
          class="history-drawer__error"
          role="alert"
        >
          {{ validationError }}
        </p>
        <div class="history-drawer__actions">
          <button
            class="history-drawer__button"
            type="submit"
          >
            預覽修正
          </button>
          <button
            class="history-drawer__button"
            type="button"
            @click="abandonEdit"
          >
            取消修正
          </button>
        </div>
      </form>
    </section>

    <section
      v-if="preview"
      class="history-drawer__preview"
      aria-labelledby="history-preview-title"
    >
      <h3 id="history-preview-title">
        修正預覽
      </h3>
      <template v-if="preview.ok">
        <p>原抽牌：{{ selectedRound?.draws.join('、') || '空局' }}</p>
        <p>修正後：{{ preview.nextState.rounds.find((round) => round.id === selectedRoundId)?.draws.join('、') || '空局' }}</p>
        <ul class="history-drawer__changes">
          <li
            v-for="item in preview.affectedRounds"
            :key="item.roundId"
          >
            第 {{ rounds.findIndex((round) => round.id === item.roundId) + 1 }} 局：剩餘 {{ item.beforeStart }} → {{ item.beforeEnd }}，修正後 {{ item.afterStart }} → {{ item.afterEnd }}
          </li>
          <li v-if="preview.affectedRounds.length === 0">
            沒有其他回合受到影響。
          </li>
        </ul>
        <ul class="history-drawer__changes">
          <li
            v-for="(change, index) in preview.boundaryChanges"
            :key="`${change.cycleId}-${index}`"
          >
            週期 {{ change.cycleId }} 邊界{{ change.kind === 'ADDED' ? '新增' : change.kind === 'REMOVED' ? '移除' : '移位' }}<template v-if="change.previousRemaining !== undefined">
              ，前週期剩 {{ change.previousRemaining }} 張
            </template>
          </li>
          <li v-if="preview.boundaryChanges.length === 0">
            週期邊界不變。
          </li>
        </ul>
        <ul
          v-if="preview.warnings.length"
          class="history-drawer__warnings"
        >
          <li
            v-for="(warning, index) in preview.warnings"
            :key="`${warning.cycleId}-${warning.roundId}-${index}`"
          >
            第 {{ rounds.findIndex((round) => round.id === warning.roundId) + 1 }} 局：{{ warning.message }}
          </li>
        </ul>
        <div class="history-drawer__pool">
          <p>修正後牌池：{{ preview.remainingTotal }} / 52 · 同步狀態 {{ preview.syncState }}</p>
          <ul>
            <li
              v-for="rank in rankLabels"
              :key="rank"
            >
              {{ rank }}：{{ preview.remainingDeck[rank] }}
            </li>
          </ul>
          <small>牌池總數 {{ deckTotal(preview.remainingDeck) }}</small>
        </div>
        <div class="history-drawer__actions">
          <button
            class="history-drawer__button history-drawer__apply"
            type="button"
            @click="emit('apply')"
          >
            {{ preview.warnings.length ? '仍套用修正並保留此邊界' : '套用修正' }}
          </button>
          <button
            class="history-drawer__button"
            type="button"
            @click="emit('cancelPreview')"
          >
            取消預覽
          </button>
        </div>
      </template>
      <p
        v-if="failedPreview"
        class="history-drawer__error"
        role="alert"
      >
        {{ failedPreviewMessage }}
      </p>
    </section>

    <details
      v-if="pageCorrections.length"
      class="history-drawer__audit"
    >
      <summary>本頁修正紀錄（{{ pageCorrections.length }}）</summary>
      <article
        v-for="item in pageCorrections"
        :key="item.id"
        class="history-drawer__audit-item"
      >
        <h3>第 {{ rounds.findIndex((round) => round.id === item.roundId) + 1 }} 局 · {{ formatDate(item.correctedAt) }}</h3>
        <p>原因：{{ item.reason }}</p>
        <p>修正前：{{ item.beforeDraws.join('、') || '空局' }}</p>
        <p>修正後：{{ item.afterDraws.join('、') || '空局' }}</p>
        <p
          v-for="(change, index) in item.boundaryChanges"
          :key="index"
        >
          邊界{{ change.kind === 'ADDED' ? '新增' : change.kind === 'REMOVED' ? '移除' : '移位' }} · {{ change.cycleId }}
        </p>
        <p
          v-for="(warning, index) in item.warnings"
          :key="index"
        >
          警告：{{ warning.message }}
        </p>
      </article>
    </details>

    <section
      v-if="showDiscardPrompt"
      class="history-drawer__discard"
      aria-labelledby="history-discard-title"
      aria-describedby="history-discard-copy"
    >
      <h3 id="history-discard-title">
        尚有未套用修正
      </h3>
      <p id="history-discard-copy">
        關閉會放棄這次修正與預覽。
      </p>
      <div class="history-drawer__actions">
        <button
          class="history-drawer__button history-drawer__danger"
          type="button"
          @click="discardAndClose"
        >
          放棄未套用修正並關閉
        </button>
        <button
          ref="discardContinueButton"
          class="history-drawer__button"
          type="button"
          @click="continueEditing"
        >
          繼續編輯
        </button>
      </div>
    </section>
  </dialog>
</template>

<style scoped lang="scss">
.history-drawer { position: fixed; inset: 0 0 0 auto; display: flex; flex-direction: column; gap: 16px; width: min(100%, 560px); max-width: none; height: 100dvh; max-height: none; margin: 0 0 0 auto; overflow-x: hidden; overflow-y: auto; padding: clamp(16px, 4vw, 24px); border-radius: 8px 0 0 8px; background: var(--anvil); color: var(--ash); }
.history-drawer:not([open]) { display: none; }
.history-drawer::backdrop { background: rgb(0 0 0 / 55%); }
.history-drawer__header, .history-drawer__round-heading, .history-drawer__pagination { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.history-drawer__header { align-items: flex-start; }
.history-drawer__eyebrow { margin: 0 0 4px; color: var(--ash-muted); font-size: 13px; }
.history-drawer h2 { margin: 0; font-size: 22px; }
.history-drawer h3 { margin: 0; font-size: 16px; }
.history-drawer__button { min-width: 44px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--control-edge); border-radius: 5px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.history-drawer__button:hover { filter: brightness(1.1); }
.history-drawer__button:active { filter: brightness(.9); transform: translateY(1px); }
.history-drawer__button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.history-drawer__button:disabled { opacity: .5; cursor: not-allowed; }
.history-drawer__rounds { display: grid; gap: 10px; min-width: 0; }
.history-drawer__cycle { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; padding: 8px 10px; border-top: 1px solid var(--edge-light); border-bottom: 1px solid var(--seam); color: var(--ash-muted); font-size: 13px; }
.history-drawer__cycle strong { color: var(--ash); }
.history-drawer__round, .history-drawer__editor, .history-drawer__preview, .history-drawer__discard { min-width: 0; padding: 14px; border: 1px solid var(--seam); border-radius: 8px; background: var(--soot); }
.history-drawer__round-heading h3 { margin-right: auto; }
.history-drawer__status { color: var(--ash-muted); font-size: 13px; }
.history-drawer__status[data-status='ACTIVE'] { color: var(--ash-muted); }
.history-drawer__draws { margin: 10px 0 6px; overflow-wrap: anywhere; color: var(--ash); font-size: 15px; line-height: 1.5; }
.history-drawer__summary, .history-drawer__count, .history-drawer__pagination { margin: 0; color: var(--ash-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.history-drawer__summary span { margin-left: 8px; }
.history-drawer__empty { margin: 0; padding: 18px; border: 1px solid var(--seam); border-radius: 8px; color: var(--ash-muted); }
.history-drawer__pagination { flex-wrap: wrap; }
.history-drawer__editor form { display: grid; gap: 8px; margin-top: 12px; }
.history-drawer label { margin-top: 4px; font-weight: 600; }
.history-drawer textarea, .history-drawer input { width: 100%; min-width: 0; min-height: 46px; padding: 10px 12px; border: 1px solid var(--control-edge); border-radius: 5px; background: var(--anvil); color: var(--ash); font: inherit; }
.history-drawer textarea { min-height: 76px; max-height: 180px; resize: none; overflow: auto; overflow-wrap: anywhere; }
.history-drawer textarea:focus-visible, .history-drawer input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.history-drawer small { color: var(--ash-muted); font-size: 13px; line-height: 1.45; }
.history-drawer [aria-invalid='true'] { border-color: var(--heat-burst); }
.history-drawer__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.history-drawer__apply { border-color: var(--heat-good); color: var(--ash); }
.history-drawer__danger { border-color: var(--heat-burst); }
.history-drawer__error { margin: 8px 0 0; color: var(--ash); line-height: 1.5; }
.history-drawer__notice { margin: 0; color: var(--ash); }
.history-drawer__changes, .history-drawer__warnings { display: grid; gap: 6px; margin: 10px 0; padding-left: 22px; line-height: 1.5; overflow-wrap: anywhere; }
.history-drawer__warnings { color: var(--ash-muted); }
.history-drawer__pool { padding: 12px; border: 1px solid var(--seam); border-radius: 5px; }
.history-drawer__pool p { margin: 0 0 8px; font-variant-numeric: tabular-nums; }
.history-drawer__pool ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; margin: 0; padding: 0; list-style: none; font-size: 13px; font-variant-numeric: tabular-nums; }
.history-drawer__pool small { display: block; margin-top: 8px; }
.history-drawer__audit { border-top: 1px solid var(--seam); }
.history-drawer__audit summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
.history-drawer__audit summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.history-drawer__audit-item { padding: 10px 0; border-top: 1px solid var(--seam); overflow-wrap: anywhere; }
.history-drawer__audit-item h3 { line-height: 1.45; }
.history-drawer__audit-item p { margin: 6px 0 0; color: var(--ash-muted); line-height: 1.45; }
.history-drawer__discard { position: sticky; bottom: 0; border-color: var(--heat-burst); box-shadow: 0 -10px 24px var(--soot); }
.history-drawer__discard p { margin: 8px 0; color: var(--ash-muted); }
@media (max-width: 359px) { .history-drawer__round, .history-drawer__editor, .history-drawer__preview { padding: 11px; } .history-drawer__round-heading { flex-wrap: wrap; } .history-drawer__pagination { justify-content: center; } }
</style>
