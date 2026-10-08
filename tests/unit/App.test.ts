/* global HTMLDialogElement */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import { useForgeStore } from '../../src/stores/forgeStore'

function prepareRefillCycle() {
  const store = useForgeStore()
  store.startRecording()
  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
    for (let copy = 0; copy < 4; copy += 1) store.recordDraw(rank)
  }
  store.recordDraw('10')
  store.recordDraw('10')
  store.finishRound()
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open')
    }
  }
})

describe('App', () => {
  it('顯示工具名稱', () => {
    const wrapper = mount(App)

    expect(wrapper.get('h1').text()).toBe('迪特的鐵匠鋪機率計算器')
  })

  it('未確認前不顯示推算數字且所有點數鍵停用；確認後把焦點移到第一鍵', async () => {
    const wrapper = mount(App, { attachTo: document.body })

    expect(wrapper.find('[data-testid="remaining-total"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-rank-key]')).toHaveLength(10)
    expect(wrapper.findAll('[data-rank-key]').every((button) => (button.element as HTMLButtonElement).disabled)).toBe(true)

    await wrapper.get('button').trigger('click')

    expect(wrapper.find('[data-testid="remaining-total"]').text()).toBe('剩 52')
    expect(document.activeElement).toBe(wrapper.get('[data-rank-key="A"]').element)
    expect((wrapper.get('button[aria-label="撤銷輸入"]').element as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('確認後記錄 4、7、6，顯示 17/21、剩 49 與固定順序的下一顆機率', async () => {
    const wrapper = mount(App)
    await wrapper.get('button').trigger('click')

    await wrapper.get('[data-rank-key="4"]').trigger('click')
    await wrapper.get('[data-rank-key="7"]').trigger('click')
    await wrapper.get('[data-rank-key="6"]').trigger('click')

    expect(wrapper.get('[data-testid="current-score"]').text()).toBe('17/21')
    expect(wrapper.get('[data-testid="remaining-total"]').text()).toBe('剩 49')
    expect(wrapper.findAll('[data-tier-probability]').map((node) => node.text())).toEqual([
      '6.12%', '16.33%', '8.16%', '0.00%', '69.39%',
    ])
    expect(wrapper.text()).toContain('顯示百分比採最大餘數法調整至小數點後兩位，合計 100.00%；比例條依原始機率呈現')
    expect(wrapper.text()).toContain('理論上的下一顆機率，不代表遊戲在 21 點或爆牌後仍允許繼續抽取')
  })

  it('點數用盡後顯示剩 0 並停用該鍵', async () => {
    const wrapper = mount(App)
    const store = useForgeStore()
    store.startRecording()

    for (let draw = 0; draw < 4; draw += 1) store.recordDraw('4')
    await nextTick()

    expect(wrapper.get('[data-rank-key="4"]').text()).toContain('剩 0')
    expect((wrapper.get('[data-rank-key="4"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('只撤銷本局最後一張，並以固定 live region 回報牌池還原', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await wrapper.get('[data-rank-key="4"]').trigger('click')
    await wrapper.get('[data-rank-key="7"]').trigger('click')
    await wrapper.get('[data-rank-key="6"]').trigger('click')

    const undo = wrapper.get('button[aria-label="撤銷輸入"]')
    expect((undo.element as HTMLButtonElement).disabled).toBe(false)
    await undo.trigger('click')

    expect(wrapper.get('[data-testid="current-score"]').text()).toBe('11/21')
    expect(wrapper.get('[data-testid="remaining-total"]').text()).toBe('剩 50')
    expect(wrapper.get('[data-rank-key="6"]').text()).toContain('剩 4')
    expect(wrapper.get('[data-testid="round-announcement"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.get('[data-testid="round-announcement"]').text()).toBe('已撤銷：6，牌池已還原。')

    await wrapper.get('[data-rank-key="6"]').trigger('click')
    await undo.trigger('click')
    expect(wrapper.get('[data-testid="round-announcement"]').text()).toBe('已撤銷：6，牌池已還原。')
    await undo.trigger('click')
    await undo.trigger('click')
    expect((undo.element as HTMLButtonElement).disabled).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[data-rank-key="A"]').element)
    await wrapper.get('[data-rank-key="2"]').trigger('click')
    expect(wrapper.get('[data-testid="round-announcement"]').text()).toBe('')
    wrapper.unmount()
  })

  it('完成確認可取消或 Escape，確認後保留結果並鎖定直到開始新局', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await wrapper.get('[data-rank-key="4"]').trigger('click')
    await wrapper.get('[data-rank-key="7"]').trigger('click')
    await wrapper.get('[data-rank-key="6"]').trigger('click')

    wrapper.get('button[aria-label="完成本局"]').element.focus()
    await wrapper.get('button[aria-label="完成本局"]').trigger('click')
    const dialog = wrapper.get('dialog[aria-labelledby="finish-round-title"]')
    expect(dialog.text()).toContain('完成後會保留本局手牌與最終分數')
    expect(dialog.text()).toContain('牌池不變')
    expect(dialog.text()).toContain('完成本局無法撤銷')
    expect(document.activeElement).toBe(dialog.get('button[aria-label="取消"]').element)
    dialog.get('button[aria-label="完成本局"]').element.focus()
    await dialog.get('button[aria-label="完成本局"]').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(dialog.get('button[aria-label="取消"]').element)
    await dialog.get('button[aria-label="取消"]').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(dialog.get('button[aria-label="完成本局"]').element)
    dialog.get('button[aria-label="取消"]').element.focus()
    await dialog.trigger('cancel')
    await nextTick()
    expect(dialog.element.hasAttribute('open')).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="完成本局"]').element)

    await wrapper.get('button[aria-label="完成本局"]').trigger('click')
    await wrapper.get('dialog[aria-labelledby="finish-round-title"] button[aria-label="完成本局"]')
      .trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="current-score"]').text()).toBe('17/21')
    expect(wrapper.text()).toContain('本局已完成')
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(false)
    expect(wrapper.findAll('[data-rank-key]').every((button) => (button.element as HTMLButtonElement).disabled)).toBe(true)
    expect((wrapper.get('button[aria-label="開始新局"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="開始新局"]').element)

    await wrapper.get('button[aria-label="開始新局"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="current-score"]').text()).toBe('0/21')
    expect(wrapper.get('[data-testid="remaining-total"]').text()).toBe('剩 49')
    expect(document.activeElement).toBe(wrapper.get('[data-rank-key="A"]').element)
    wrapper.unmount()
  })

  it('開始新局後將焦點移到第一個仍可輸入的點數鍵', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const store = useForgeStore()
    store.startRecording()
    for (let draw = 0; draw < 4; draw += 1) store.recordDraw('A')
    store.finishRound()
    await nextTick()

    await wrapper.get('button[aria-label="開始新局"]').trigger('click')

    expect(document.activeElement).toBe(wrapper.get('[data-rank-key="2"]').element)
    wrapper.unmount()
  })

  it('允許空手牌完成，且 21 點或爆牌不會自動完成本局', async () => {
    const emptyRound = mount(App)
    await emptyRound.get('button').trigger('click')
    await emptyRound.get('button[aria-label="完成本局"]').trigger('click')
    await emptyRound.get('dialog[aria-labelledby="finish-round-title"] button[aria-label="完成本局"]')
      .trigger('click')
    expect(emptyRound.get('[data-testid="current-score"]').text()).toBe('0/21')
    expect(emptyRound.text()).toContain('本局已完成')
    emptyRound.unmount()

    for (const hand of [['A', '10'], ['10', '10', '2']] as const) {
      setActivePinia(createPinia())
      const wrapper = mount(App)
      const store = useForgeStore()
      store.startRecording()
      for (const rank of hand) store.recordDraw(rank)
      await nextTick()
      expect(store.roundStatus).toBe('ACTIVE')
      expect(wrapper.find('button[aria-label="完成本局"]').exists()).toBe(true)
      wrapper.unmount()
    }
  })

  it('開始低於 15 顆後，以非阻擋提示詢問遊戲是否顯示 52 顆', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const store = prepareRefillCycle()
    await nextTick()
    expect(store.remainingTotal).toBe(14)
    expect(wrapper.text()).toContain('下局預計補滿為 52 顆')
    expect(wrapper.text()).toContain('尚未經遊戲畫面確認')
    await nextTick()

    await wrapper.get('button[aria-label="開始新局"]').trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('遊戲現在顯示 52 顆嗎？')
    expect(wrapper.text()).toContain('上一局結束時剩 14 顆')
    expect(wrapper.find('dialog[open]').exists()).toBe(false)
    expect(wrapper.findAll('[data-cycle-observation]')).toHaveLength(3)
    expect(wrapper.get('[data-testid="remaining-total"]').text()).toBe('剩 52')
    expect(wrapper.text()).toContain('推定補滿，尚未確認遊戲畫面')
    expect(document.activeElement).toBe(wrapper.get('[data-rank-key="A"]').element)
    wrapper.unmount()
  })

  it('稍後保留未觀察狀態並可重開；確認後更新狀態且焦點留在回饋', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const store = prepareRefillCycle()
    await nextTick()
    await wrapper.get('button[aria-label="開始新局"]').trigger('click')
    await wrapper.get('[data-cycle-observation="LATER"]').trigger('click')

    expect(store.currentCycle?.observation).toBeUndefined()
    expect(wrapper.text()).toContain('推定補滿，尚未確認遊戲畫面')
    const reopenButton = wrapper.findAll('button').find((button) => button.text() === '確認補滿情形')
    await reopenButton?.trigger('click')
    expect(wrapper.find('[data-cycle-observation="CONFIRMED_52"]').exists()).toBe(true)
    await wrapper.get('[data-cycle-observation="CONFIRMED_52"]').trigger('click')
    await nextTick()

    expect(store.currentCycle?.observation).toBe('CONFIRMED_52')
    expect(store.integrity).toBe('SYNCED')
    expect(wrapper.text()).toContain('已確認遊戲顯示 52 顆')
    expect(document.activeElement).toBe(wrapper.get('[role="status"]').element)
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('回答不是後隱藏機率，但仍允許記錄、撤銷、完成及開始新局', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const store = prepareRefillCycle()
    await nextTick()
    await wrapper.get('button[aria-label="開始新局"]').trigger('click')
    await wrapper.get('[data-cycle-observation="DENIED"]').trigger('click')
    await nextTick()

    expect(store.integrity).toBe('UNSYNCED')
    expect(wrapper.text()).toContain('牌池未同步')
    expect(wrapper.text()).toContain('目前不能保證精確機率')
    expect(wrapper.text()).toContain('手動修正入口尚未提供')
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(false)
    await wrapper.get('[data-rank-key="A"]').trigger('click')
    expect(store.currentHand).toEqual(['A'])
    expect(wrapper.get('[data-rank-key="A"]').text()).toContain('推定剩 3')
    await wrapper.get('button[aria-label="撤銷輸入"]').trigger('click')
    expect(store.currentHand).toEqual([])
    await wrapper.get('[data-rank-key="2"]').trigger('click')
    await wrapper.get('button[aria-label="完成本局"]').trigger('click')
    await wrapper.get('dialog[aria-labelledby="finish-round-title"] button[aria-label="完成本局"]')
      .trigger('click')
    expect(store.roundStatus).toBe('FINISHED')
    await wrapper.get('button[aria-label="開始新局"]').trigger('click')
    expect(store.roundStatus).toBe('ACTIVE')
    expect(store.integrity).toBe('UNSYNCED')
    expect(wrapper.text()).toContain('目前不能保證精確機率')
    wrapper.unmount()
  })
})
