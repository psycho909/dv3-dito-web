<script setup lang="ts">
/* global HTMLDialogElement, HTMLButtonElement, HTMLElement, document, Event, KeyboardEvent */
import { nextTick, ref, watch } from 'vue'
import type { VersionRelease, VersionSection } from '../domain/versionHistory'

const props = defineProps<{
  open: boolean
  releases: readonly VersionRelease[]
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const SECTION_LABELS: readonly { key: VersionSection; label: string }[] = [
  { key: 'Added', label: '新增' },
  { key: 'Changed', label: '調整' },
  { key: 'Fixed', label: '修正' },
]

const dialog = ref<HTMLDialogElement>()
const closeButton = ref<HTMLButtonElement>()
let returnFocusTo: HTMLElement | null = null

watch(() => props.open, async (open) => {
  await nextTick()
  const element = dialog.value
  if (open && element && !element.open) {
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    await nextTick()
    closeButton.value?.focus()
  } else if (!open) {
    if (element?.open) element.close()
    restoreFocus()
  }
}, { flush: 'post' })

function sectionsWithEntries(release: VersionRelease) {
  return SECTION_LABELS
    .map((section) => ({ ...section, entries: release.sections[section.key] }))
    .filter((section) => section.entries.length > 0)
}

function restoreFocus() {
  const target = returnFocusTo
  returnFocusTo = null
  if (target?.isConnected) void nextTick(() => target.focus())
}

function closeDialog() {
  if (!props.open) return
  dialog.value?.close()
  emit('update:open', false)
  restoreFocus()
}

function handleCancel(event: Event) {
  event.preventDefault()
  closeDialog()
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

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
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
    v-if="open"
    ref="dialog"
    class="version-history-dialog"
    aria-modal="true"
    aria-labelledby="version-history-title"
    @cancel="handleCancel"
    @keydown="trapTab"
  >
    <header class="version-history-dialog__header">
      <h2 id="version-history-title">
        版本紀錄
      </h2>
      <button
        ref="closeButton"
        class="version-history-dialog__close"
        type="button"
        aria-label="關閉版本紀錄"
        @click="closeDialog"
      >
        關閉
      </button>
    </header>
    <ol class="version-history-dialog__releases">
      <li
        v-for="release in releases"
        :key="release.version"
        class="version-history-dialog__release"
      >
        <article>
          <header class="version-history-dialog__release-header">
            <h3>v{{ release.version }}</h3>
            <time :datetime="release.date">{{ release.date }}</time>
          </header>
          <section
            v-for="section in sectionsWithEntries(release)"
            :key="section.key"
            class="version-history-dialog__section"
          >
            <h4>{{ section.label }}</h4>
            <ul>
              <li
                v-for="entry in section.entries"
                :key="entry"
              >
                {{ entry }}
              </li>
            </ul>
          </section>
        </article>
      </li>
    </ol>
  </dialog>
</template>

<style scoped lang="scss">
.version-history-dialog { box-sizing: border-box; width: min(calc(100% - 24px), 640px); max-height: min(82dvh, 720px); padding: 0 clamp(16px, 4vw, 24px) 18px; overflow: auto; border: 1px solid var(--seam); border-radius: 8px; background: var(--anvil); color: var(--ash); box-shadow: 0 16px 48px color-mix(in srgb, var(--soot), transparent 28%); }
.version-history-dialog::backdrop { background: color-mix(in srgb, var(--soot), transparent 30%); }
.version-history-dialog__header { position: sticky; z-index: 1; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 -2px; padding: 18px 2px 12px; border-bottom: 1px solid var(--seam); background: var(--anvil); }
.version-history-dialog h2, .version-history-dialog h3, .version-history-dialog h4, .version-history-dialog p { margin: 0; }
.version-history-dialog h2 { font-size: 20px; line-height: 1.35; }
.version-history-dialog__close { min-width: 72px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--control-edge); border-radius: 6px; background: var(--anvil-raised); color: var(--ash); font: inherit; cursor: pointer; }
.version-history-dialog__close:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.version-history-dialog__releases { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.version-history-dialog__release { min-width: 0; padding: 18px 0; border-bottom: 1px solid var(--seam); overflow-wrap: anywhere; }
.version-history-dialog__release-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.version-history-dialog__release-header h3 { font-size: 17px; }
.version-history-dialog__release-header time { color: var(--ash-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.version-history-dialog__section { margin-top: 12px; }
.version-history-dialog__section h4 { color: var(--ash-muted); font-size: 13px; }
.version-history-dialog__section ul { display: grid; gap: 6px; margin: 6px 0 0; padding-left: 20px; line-height: 1.55; }
@media (max-width: 380px) { .version-history-dialog { max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px); } }
</style>
