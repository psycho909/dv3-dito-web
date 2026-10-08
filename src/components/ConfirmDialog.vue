<script setup lang="ts">
/* global HTMLDialogElement, HTMLButtonElement, HTMLElement, document, Event, KeyboardEvent */
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
}>(), {
  cancelLabel: '取消',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
  'update:open': [open: boolean]
}>()

const dialog = ref<HTMLDialogElement>()
const cancelButton = ref<HTMLButtonElement>()
let returnFocusTo: HTMLElement | null = null

watch(() => props.open, async (open) => {
  await nextTick()
  const element = dialog.value
  if (!element) return

  if (open && !element.open) {
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    await nextTick()
    cancelButton.value?.focus()
  } else if (!open && element.open) {
    element.close()
    restoreFocus()
  }
}, { flush: 'post' })

function restoreFocus() {
  const target = returnFocusTo
  returnFocusTo = null
  if (target?.isConnected) void nextTick(() => target.focus())
}

function cancel() {
  if (!props.open) return
  dialog.value?.close()
  emit('update:open', false)
  emit('cancel')
  restoreFocus()
}

function confirm() {
  if (!props.open) return
  dialog.value?.close()
  emit('update:open', false)
  emit('confirm')
}

function handleCancel(event: Event) {
  event.preventDefault()
  cancel()
}

function trapTab(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const element = dialog.value
  if (!element) return
  const focusable = [...element.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )].filter((item) => !item.hidden)
  if (focusable.length === 0) {
    event.preventDefault()
    element.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    aria-modal="true"
    :aria-labelledby="`${$attrs.id ?? 'confirm'}-title`"
    :aria-describedby="`${$attrs.id ?? 'confirm'}-description`"
    @cancel="handleCancel"
    @keydown="trapTab"
  >
    <div class="confirm-dialog__content">
      <h2 :id="`${$attrs.id ?? 'confirm'}-title`">
        {{ title }}
      </h2>
      <p :id="`${$attrs.id ?? 'confirm'}-description`">
        {{ description }}
      </p>
      <div class="confirm-dialog__actions">
        <button
          ref="cancelButton"
          class="confirm-dialog__button confirm-dialog__button--cancel"
          type="button"
          :aria-label="cancelLabel"
          @click="cancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          class="confirm-dialog__button confirm-dialog__button--confirm"
          type="button"
          :aria-label="confirmLabel"
          @click="confirm"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.confirm-dialog { width: min(100% - 32px, 480px); max-height: min(80dvh, 640px); padding: 0; overflow: auto; border: 1px solid var(--seam); border-radius: 8px; background: var(--anvil); color: var(--ash); box-shadow: 0 16px 48px color-mix(in srgb, var(--soot), transparent 28%); }
.confirm-dialog::backdrop { background: color-mix(in srgb, var(--soot), transparent 30%); }
.confirm-dialog__content { padding: clamp(20px, 5vw, 28px); }
h2 { margin: 0; color: var(--ash); font-size: 20px; line-height: 1.35; }
p { margin: 12px 0 0; color: var(--ash-muted); line-height: 1.65; white-space: pre-line; }
.confirm-dialog__actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.confirm-dialog__button { min-width: 96px; min-height: 44px; padding: 8px 14px; border: 1px solid var(--seam); border-radius: 8px; font: inherit; cursor: pointer; }
.confirm-dialog__button--cancel { background: var(--anvil-raised); color: var(--ash); }
.confirm-dialog__button--confirm { border-color: var(--edge-light); background: var(--ash); color: var(--soot); font-weight: 650; }
.confirm-dialog__button:hover { filter: brightness(1.08); }
.confirm-dialog__button:active { filter: brightness(.92); transform: translateY(1px); }
.confirm-dialog__button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (max-width: 380px) { .confirm-dialog { max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px); } .confirm-dialog__actions { flex-direction: column-reverse; } .confirm-dialog__button { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .confirm-dialog, .confirm-dialog__button { scroll-behavior: auto; } }
</style>
