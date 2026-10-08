/* global HTMLDialogElement */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import { useForgeStore } from '../../src/stores/forgeStore'
import * as recommendationDomain from '../../src/domain/recommendation'

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
  localStorage.clear()
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

afterEach(() => vi.restoreAllMocks())

describe('App', () => {
  it('計算上限只改建議原因，真實機率與記錄操作仍可使用', async () => {
    vi.spyOn(recommendationDomain, 'recommendWithinRound')
      .mockReturnValue({ action: 'NONE', reason: 'COMPUTATION_LIMIT' })
    const wrapper = mount(App)
    await wrapper.get('button').trigger('click')
    for (const rank of ['4', '7', '6']) await wrapper.get(`[data-rank-key="${rank}"]`).trigger('click')

    const hint = wrapper.get('.recommendation-hint')
    expect(hint.get('.recommendation-hint__message').text()).toBe('目前無法計算建議')
    expect(hint.findAll('button')).toHaveLength(0)
    expect(wrapper.get('[data-tier-probability="PERFECT"]').text()).toBe('6.12%')
    expect(wrapper.get('[data-tier-probability="BURST"]').text()).toBe('69.39%')
    expect(wrapper.get('.forge-app__results').element.children[1]).toBe(hint.element)
    expect(wrapper.get('button[aria-label="撤銷輸入"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('21、BURST、空牌池顯示原因且不提供再抽或停手建議', async () => {
    const wrapper = mount(App)
    const store = useForgeStore()
    store.startRecording()
    for (const rank of ['10', '10', 'A'] as const) store.recordDraw(rank)
    await nextTick()
    expect(wrapper.get('.recommendation-hint__message').text()).toBe('目前是 21 點，沒有建議動作。')

    store.recordDraw('2')
    await nextTick()
    expect(wrapper.get('.recommendation-hint__message').text()).toBe('目前已爆牌，沒有建議動作。')

    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const) {
      while (store.remainingDeck[rank] > 0) store.recordDraw(rank)
    }
    await nextTick()
    expect(wrapper.get('.recommendation-hint__message').text()).toBe('牌池沒有剩餘石頭，無法提供建議。')
    expect(wrapper.get('.recommendation-hint').text()).not.toMatch(/建議再抽|建議停手|NaN|Infinity/)
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('推薦不保存為 metadata，寫入失敗時隱藏；重讀恢復原局建議且不重放失敗輸入', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('button').trigger('click')
    for (const rank of ['4', '7', '6']) await wrapper.get(`[data-rank-key="${rank}"]`).trigger('click')
    expect(wrapper.get('.recommendation-hint').text()).toContain('再抽平均差 15.76')
    const saved = localStorage.getItem('dito-forge:local:v1')
    expect(saved).not.toMatch(/"(?:recommend[^"]*|withinRound|stopDistance|drawExpectedDistance)"\s*:/i)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    await wrapper.get('[data-rank-key="2"]').trigger('click')
    expect(wrapper.find('.recommendation-hint').exists()).toBe(false)
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(false)
    expect(localStorage.getItem('dito-forge:local:v1')).toBe(saved)

    const retry = wrapper.findAll('button').find((button) => button.text() === '重新讀取本機資料')
    expect(retry).toBeDefined()
    await retry?.trigger('click')
    expect(useForgeStore().currentHand).toEqual(['4', '7', '6'])
    expect(wrapper.get('.recommendation-hint').text()).toContain('建議停手')
    expect(wrapper.get('.recommendation-hint').text()).toContain('再抽平均差 15.76')
    expect(localStorage.getItem('dito-forge:local:v1')).toBe(saved)
    wrapper.unmount()
  })

  it('未初始化時不建立結果區空 grid area；開始記錄後才顯示結果與建議', async () => {
    const wrapper = mount(App)
    expect(wrapper.find('.forge-app__results').exists()).toBe(false)
    expect(wrapper.find('.recommendation-hint').exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('.forge-app__results').exists()).toBe(true)
    expect(wrapper.get('.recommendation-hint').text()).toContain('建議再抽：目前 0 點')
    wrapper.unmount()
  })

  it('空牌池寫入失敗後重讀成功，焦點移到仍可操作的完成本局', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const store = useForgeStore()
    store.startRecording()
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const) {
      for (let copy = 0; copy < (rank === '10' ? 16 : 4); copy += 1) store.recordDraw(rank)
    }
    expect(store.remainingTotal).toBe(0)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    expect(store.finishRound()).toBe(false)
    await nextTick()
    const retry = wrapper.findAll('button').find((button) => button.text() === '重新讀取本機資料')
    await retry?.trigger('click')
    await nextTick()
    expect(store.persistenceStatus).toBe('READY')
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="完成本局"]').element)
    wrapper.unmount()
  })
  it('重新建立頁面後恢復局中手牌、分數及機率，並明示僅本機', async () => {
    const first = mount(App)
    const store = useForgeStore()
    store.startRecording()
    for (const rank of ['4', '7', '6'] as const) store.recordDraw(rank)
    first.unmount()
    setActivePinia(createPinia())
    const restored = mount(App)
    await nextTick()
    expect(useForgeStore().currentScore).toBe(17)
    expect(restored.get('[data-testid="current-score"]').text()).toBe('17/21')
    expect(restored.get('[data-testid="remaining-total"]').text()).toBe('剩 49')
    expect(restored.get('[data-tier-probability="PERFECT"]').text()).toBe('6.12%')
    expect(restored.get('.recommendation-hint').text()).toContain('再抽平均差 15.76')
    expect(restored.text()).toContain('僅本機')
    expect(restored.text()).not.toContain('重新整理會清除')
    restored.unmount()
  })
  it('本機資料損毀時停止遊戲操作、保留原始資料並提供復原入口', async () => {
    localStorage.setItem('dito-forge:local:v1', '{broken')
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.text()).toContain('本機資料暫時無法使用')
    expect(wrapper.find('[data-rank-key]').exists()).toBe(false)
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(false)
    expect(wrapper.text()).toContain('下載原始資料')
    expect(wrapper.text()).toContain('重新讀取本機資料')
    expect(localStorage.getItem('dito-forge:local:v1')).toBe('{broken')
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('#local-recovery-title').element)
    const retry = wrapper.findAll('button').find((button) => button.text() === '重新讀取本機資料')
    expect(retry).toBeDefined()
    await retry?.trigger('click')
    expect(localStorage.getItem('dito-forge:local:v1')).toBe('{broken')
    expect(wrapper.find('[data-rank-key]').exists()).toBe(false)
    wrapper.unmount()
  })
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
    expect(wrapper.get('.recommendation-hint').text()).toContain('建議停手：停在 17，距 21 差 4；再抽平均差 15.76。')
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
    expect(wrapper.find('.recommendation-hint').exists()).toBe(false)
    expect(wrapper.find('.forge-app__results').exists()).toBe(true)
    expect(wrapper.findAll('[data-rank-key]').every((button) => (button.element as HTMLButtonElement).disabled)).toBe(true)
    expect((wrapper.get('button[aria-label="開始新局"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="開始新局"]').element)

    await wrapper.get('button[aria-label="開始新局"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="current-score"]').text()).toBe('0/21')
    expect(wrapper.get('[data-testid="remaining-total"]').text()).toBe('剩 49')
    expect(wrapper.get('.recommendation-hint').text()).toContain('建議再抽：目前 0 點')
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
      localStorage.clear()
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
    expect(wrapper.get('.recommendation-hint__message').text()).toBe('牌池未同步，無法提供建議。')
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
