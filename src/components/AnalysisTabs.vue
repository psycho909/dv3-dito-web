<script setup lang="ts">
/* global window, HTMLButtonElement, KeyboardEvent */
import { onMounted, ref } from 'vue'

type AnalysisTabId = 'next' | 'round' | 'tokens'

const STORAGE_KEY = 'dito-forge:analysis-tab'
const tabs: ReadonlyArray<{ id: AnalysisTabId; label: string }> = [
  { id: 'next', label: '下一顆' },
  { id: 'round', label: '本局預估' },
  { id: 'tokens', label: '遊玩代幣' },
]

const selectedTab = ref<AnalysisTabId>('next')
const tabButtons: HTMLButtonElement[] = []

function isAnalysisTab(value: string | null): value is AnalysisTabId {
  return tabs.some((tab) => tab.id === value)
}

function selectTab(id: AnalysisTabId, moveFocus = false) {
  selectedTab.value = id
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage can be disabled; the selected tab still works for this page.
  }
  if (moveFocus) {
    const index = tabs.findIndex((tab) => tab.id === id)
    tabButtons[index]?.focus()
  }
}

function handleKeydown(event: KeyboardEvent, index: number) {
  let nextIndex: number | null = null
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = tabs.length - 1
  if (nextIndex === null) return

  event.preventDefault()
  selectTab(tabs[nextIndex].id, true)
}

onMounted(() => {
  try {
    const remembered = window.localStorage.getItem(STORAGE_KEY)
    if (isAnalysisTab(remembered)) selectedTab.value = remembered
  } catch {
    // Keep the default tab when storage is disabled or unavailable.
  }
})
</script>

<template>
  <div class="analysis-tabs">
    <div
      class="analysis-tabs__list"
      role="tablist"
      aria-label="分析"
      aria-orientation="horizontal"
    >
      <button
        v-for="(tab, index) in tabs"
        :id="`analysis-tab-${tab.id}`"
        :key="tab.id"
        :ref="(element) => { if (element) tabButtons[index] = element as HTMLButtonElement }"
        class="analysis-tabs__tab"
        type="button"
        role="tab"
        :aria-selected="selectedTab === tab.id"
        :aria-controls="`analysis-panel-${tab.id}`"
        :tabindex="selectedTab === tab.id ? 0 : -1"
        @click="selectTab(tab.id)"
        @keydown="handleKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>

    <section
      v-for="tab in tabs"
      :id="`analysis-panel-${tab.id}`"
      :key="`panel-${tab.id}`"
      class="analysis-tabs__panel"
      role="tabpanel"
      :aria-labelledby="`analysis-tab-${tab.id}`"
      :hidden="selectedTab !== tab.id"
      :tabindex="selectedTab === tab.id ? 0 : -1"
      :data-analysis-panel="tab.id"
    >
      <slot :name="tab.id" />
    </section>
  </div>
</template>

<style scoped lang="scss">
.analysis-tabs { display: grid; min-width: 0; }
.analysis-tabs__list { display: flex; min-width: 0; border-bottom: 1px solid var(--seam); }
.analysis-tabs__tab { min-height: 44px; flex: 1 1 0; padding: 8px 10px; border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--ash-muted); font: inherit; font-size: 14px; font-weight: 650; white-space: nowrap; cursor: pointer; }
.analysis-tabs__tab[aria-selected='true'] { border-bottom-color: var(--heat-perfect); color: var(--ash); }
.analysis-tabs__tab:hover { background: color-mix(in srgb, var(--anvil-raised), transparent 35%); color: var(--ash); }
.analysis-tabs__tab:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
.analysis-tabs__panel { min-width: 0; padding-block: 6px; }
.analysis-tabs__panel[hidden] { display: none; }
.analysis-tabs__panel:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
