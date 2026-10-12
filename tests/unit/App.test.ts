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
  it('以三個可存取分頁整理首屏下方分析，預設選取下一顆並可用方向鍵切換', async () => {
    const wrapper = mount(App)
    const tablist = wrapper.find('[role="tablist"][aria-label="分析"]')

    expect(tablist.exists()).toBe(true)
    expect(tablist.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      '下一顆', '本局預估', '遊玩代幣',
    ])
    expect(tablist.find('[role="tab"][aria-selected="true"]').text()).toBe('下一顆')
    const firstTab = tablist.find('[role="tab"]')
    await firstTab.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(tablist.find('[role="tab"][aria-selected="true"]').text()).toBe('本局預估')
    expect(localStorage.getItem('dito-forge:analysis-tab')).toBe('round')
    wrapper.unmount()
  })

  it('分析分頁記憶讀寫失敗時仍可切換', async () => {
    const analysisKey = 'dito-forge:analysis-tab'
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === analysisKey) throw new Error('storage denied')
      return originalGetItem.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === analysisKey) throw new Error('storage denied')
      return originalSetItem.call(this, key, value)
    })

    const wrapper = mount(App)
    const tablist = wrapper.get('[role="tablist"][aria-label="分析"]')
    await tablist.get('[role="tab"][aria-selected="true"]').trigger('keydown', { key: 'ArrowRight' })
    await nextTick()

    expect(tablist.get('[role="tab"][aria-selected="true"]').text()).toBe('本局預估')
    wrapper.unmount()
  })

  it('遊玩代幣分頁在零筆完成紀錄時仍顯示新牌池參考與首局提示', async () => {
    const wrapper = mount(App)
    await wrapper.get('[role="tab"][aria-controls="analysis-panel-tokens"]').trigger('click')
    await nextTick()

    const reference = wrapper.get('[data-testid="play-history-reference"]')
    expect(reference.text()).toContain('完成第一局後顯示')
    expect(reference.text()).toContain('新牌池基準')
    expect(reference.text()).toContain('每 1 遊玩代幣期望得分 3.42')
    wrapper.unmount()
  })

  it('自動備份與記錄點數的說明各保留一處，使用 GitHub 帳號用語', () => {
    const wrapper = mount(App)
    const text = wrapper.text()
    const backupCopy = '登入後，牌局會自動備份到你的 GitHub 帳號雲端空間。'
    const drawCopy = '點數只會記錄你在遊戲中已抽出的石頭。'

    expect(text.split(backupCopy)).toHaveLength(2)
    expect(text.split(drawCopy)).toHaveLength(2)
    expect(text).not.toContain('Supabase 帳號')
    wrapper.unmount()
  })

  it('遊玩紀錄只統計完成局並用等級得分換算 x1 平均與分布', async () => {
    const wrapper = mount(App)
    const store = useForgeStore()
    expect(store.startRecording()).toBe(true)
    const completedHands = [
      ['10', '9'],
      ['10', '6'],
      ['10', '10', '2'],
    ] as const

    for (const [index, hand] of completedHands.entries()) {
      if (index > 0) expect(store.startRound()).toBe(true)
      for (const rank of hand) expect(store.recordDraw(rank)).toBe(true)
      expect(store.finishRound()).toBe(true)
    }
    expect(store.startRound()).toBe(true)
    expect(store.recordDraw('4')).toBe(true)

    await wrapper.get('[role="tab"][aria-controls="analysis-panel-tokens"]').trigger('click')
    await nextTick()
    const reference = wrapper.get('[data-testid="play-history-reference"]')
    expect(reference.text()).toContain('3 局')
    expect(reference.text()).toContain('23.67 分')
    expect(reference.text()).toContain('2.37 分')
    expect(reference.text()).toContain('GREAT')
    expect(reference.text()).toContain('GOOD')
    expect(reference.text()).toContain('BURST')
    expect(reference.text()).toContain('樣本少，僅供參考')
    wrapper.unmount()
  })

  it('依爆牌加降級計算下一顆變差率，不把較低等級誤算成安全', async () => {
    const scenarios = [
      {
        hand: ['A', '8'] as const,
        riskLevel: 'high',
        fill: '54%',
        burst: '爆牌 0.00%',
        downgrade: '降級 54.00%',
        unchanged: '不變差 46.00%',
      },
      {
        hand: ['10', '9'] as const,
        riskLevel: 'high',
        fill: '84%',
        burst: '爆牌 84.00%',
        downgrade: null,
        unchanged: '不變差 16.00%',
      },
      {
        hand: ['10', '4'] as const,
        riskLevel: 'caution',
        fill: '46%',
        burst: '爆牌 46.00%',
        downgrade: null,
        unchanged: '不變差 54.00%',
      },
    ]

    for (const scenario of scenarios) {
      localStorage.clear()
      setActivePinia(createPinia())
      const wrapper = mount(App)
      const store = useForgeStore()
      store.startRecording()
      for (const rank of scenario.hand) store.recordDraw(rank)
      await nextTick()

      const risk = wrapper.get('[data-testid="next-draw-risk"]')
      expect(risk.attributes('data-risk-level')).toBe(scenario.riskLevel)
      const fillWidth = Number(risk.get('.risk-strip__fill').attributes('style')?.match(/([\d.]+)%/)?.[1])
      expect(fillWidth).toBeCloseTo(Number.parseFloat(scenario.fill), 2)
      expect(risk.text()).toContain(scenario.burst)
      expect(risk.text()).toContain(scenario.unchanged)
      expect(risk.text()).not.toContain('安全率')
      if (scenario.downgrade) expect(risk.text()).toContain(scenario.downgrade)
      else expect(risk.text()).not.toContain('降級')
      wrapper.unmount()
    }
  })

  it('建議停手時強調標籤與完成本局，切入停手才播報一次', async () => {
    const wrapper = mount(App)
    const store = useForgeStore()
    store.startRecording()
    store.recordDraw('A')
    store.recordDraw('8')
    await nextTick()

    expect(store.recommendation?.action).toBe('STOP')
    const recommendation = wrapper.get('.summary__recommendation')
    expect(recommendation.classes()).toContain('summary__recommendation--stop')
    expect(recommendation.attributes('aria-live')).toBeUndefined()
    expect(wrapper.get('.recommendation-hint__message').attributes('aria-live')).toBeUndefined()
    const finishButton = wrapper.get('button[aria-label="完成本局"]')
    expect(finishButton.classes()).toContain('round-actions__button--recommended-stop')

    const announcement = wrapper.get('[data-testid="stop-recommendation-announcement"]')
    expect(announcement.attributes('aria-live')).toBe('polite')
    expect(announcement.text()).toBe('建議停手，完成本局')
    let announcementMutations = 0
    const observer = new MutationObserver(() => { announcementMutations += 1 })
    observer.observe(announcement.element, { childList: true, characterData: true, subtree: true })

    store.recordDraw('10')
    await nextTick()
    expect(store.recommendation?.action).toBe('STOP')
    expect(announcement.text()).toBe('建議停手，完成本局')
    await nextTick()
    expect(announcementMutations).toBe(0)
    observer.disconnect()

    store.finishRound()
    store.startRound()
    store.recordDraw('4')
    await nextTick()
    expect(store.recommendation?.action).toBe('DRAW')
    expect(wrapper.get('.summary__recommendation').classes())
      .not.toContain('summary__recommendation--stop')
    expect(wrapper.get('button[aria-label="完成本局"]').classes())
      .not.toContain('round-actions__button--recommended-stop')
    expect(announcement.text()).toBe('')
    wrapper.unmount()
  })

  it('機率表顯示各級距得分與無障礙文字；完局結果顯示等級得分', async () => {
    const wrapper = mount(App)
    await wrapper.get('button').trigger('click')

    const expectedScores = [
      ['PERFECT', '100 分'],
      ['GREAT', '50 分'],
      ['GOOD', '20 分'],
      ['NORMAL', '5 分'],
      ['BURST', '1 分'],
    ] as const
    for (const [tier, scoreText] of expectedScores) {
      const row = wrapper.get(`.probability__row[data-tier="${tier}"]`)
      expect(row.text()).toContain(scoreText)
      expect(row.get('.probability__track').attributes('aria-label')).toContain(scoreText)
    }

    const store = useForgeStore()
    for (const rank of ['10', '10'] as const) store.recordDraw(rank)
    store.finishRound()
    await nextTick()
    expect(wrapper.get('.summary__finished-result').text()).toBe('本局 GREAT，得 50 分')

    store.startRound()
    store.recordDraw('4')
    store.finishRound()
    await nextTick()
    expect(wrapper.get('.summary__finished-result').text()).toBe('本局 NORMAL，得 5 分')
    wrapper.unmount()
  })

  it('已達 21 點或爆牌時顯示本局狀態；完局風險數字與下局預估一致', async () => {
    const wrapper = mount(App)
    const store = useForgeStore()
    store.startRecording()
    for (const rank of ['10', '4', '3', 'A', '2', '6'] as const) store.recordDraw(rank)
    await nextTick()

    const risk = wrapper.get('[data-testid="next-draw-risk"]')
    expect(risk.text()).toBe('本局已爆牌')
    expect(risk.attributes('data-risk-level')).toBe('terminal')
    expect(risk.attributes('aria-label')).toBe('本局已爆牌')
    expect(risk.find('.risk-strip__track').exists()).toBe(false)

    store.finishRound()
    store.startRound()
    for (const rank of ['10', '5', '6'] as const) store.recordDraw(rank)
    await nextTick()
    expect(risk.text()).toBe('已達 21 點')
    expect(risk.attributes('data-risk-level')).toBe('terminal')
    expect(risk.attributes('aria-label')).toBe('已達 21 點')
    expect(risk.text()).not.toMatch(/%|高風險/)
    expect(risk.find('.risk-strip__track').exists()).toBe(false)

    store.finishRound()
    await nextTick()
    const forecastBurst = wrapper.get(
      '[aria-label="下一局等級預估"] [data-forecast-tier-probability="BURST"] strong',
    ).text()
    expect(risk.text()).toContain(`下局預估爆牌 ${forecastBurst}（依建議操作）`)
    const forecastFill = Number(risk.get('.risk-strip__fill').attributes('style')?.match(/([\d.]+)%/)?.[1])
    expect(forecastFill).toBeCloseTo(Number.parseFloat(forecastBurst), 1)
    expect(risk.text()).not.toContain('安全率')
    expect(risk.attributes('aria-label')).toContain(`下局預估爆牌 ${forecastBurst}（依建議操作）`)
    wrapper.unmount()
  })

  it('剩 15 顆以下的完局預估標示推定 52 顆', async () => {
    const store = prepareRefillCycle()
    const wrapper = mount(App)
    await nextTick()

    expect(store.remainingTotal).toBe(14)
    const risk = wrapper.get('[data-testid="next-draw-risk"]')
    expect(risk.text()).toContain('推定 52 顆')
    const forecastBurst = wrapper.get(
      '[aria-label="下一局等級預估"] [data-forecast-tier-probability="BURST"] strong',
    ).text()
    expect(risk.text()).toContain(`下局預估爆牌 ${forecastBurst}（依建議操作）`)
    expect(risk.text()).not.toContain('安全率')
    wrapper.unmount()
  })

  it('歷史入口開啟抽屜並返回焦點，預覽及套用交由 store', async () => {
    const store = useForgeStore()
    store.startRecording()
    store.recordDraw('4')
    const wrapper = mount(App, { attachTo: document.body })
    const button = wrapper.get('[data-history-open]')
    await button.trigger('click')
    await nextTick()
    expect(wrapper.get('.history-drawer').attributes('open')).toBeDefined()
    const drawer = wrapper.findComponent({ name: 'HistoryDrawer' })
    drawer.vm.$emit('preview', { roundId: store.rounds[0].id, draws: ['6'], reason: '第一顆是 6' })
    await nextTick()
    expect(store.historyPreview?.ok).toBe(true)
    drawer.vm.$emit('apply')
    await nextTick()
    expect(store.currentHand).toEqual(['6'])
    expect(wrapper.text()).toContain('已套用修正')
    drawer.vm.$emit('close')
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(button.element)
    wrapper.unmount()
  })

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
    expect(wrapper.get('.forge-app__results').element.contains(hint.element)).toBe(true)
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
    expect(wrapper.get('[aria-label="本局最終等級預估"] [data-forecast-tier-probability="PERFECT"]').text())
      .toContain('100.0%')

    store.recordDraw('2')
    await nextTick()
    expect(wrapper.get('.recommendation-hint__message').text()).toBe('目前已爆牌，沒有建議動作。')
    expect(wrapper.get('[aria-label="本局最終等級預估"] [data-forecast-tier-probability="BURST"]').text())
      .toContain('100.0%')

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
    expect(wrapper.get('.recommendation-hint').text()).toContain('再抽期望得分 16.61 分')
    const saved = localStorage.getItem('dito-forge:local:v1')
    expect(saved).not.toMatch(/"(?:recommend[^"]*|withinRound|stopScore|drawExpectedScore)"\s*:/i)
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
    expect(wrapper.get('.recommendation-hint').text()).toContain('再抽期望得分 16.61 分')
    expect(localStorage.getItem('dito-forge:local:v1')).toBe(saved)
    wrapper.unmount()
  })

  it('未初始化時可查看分析分頁；開始記錄後下一顆分頁顯示結果與建議', async () => {
    const wrapper = mount(App)
    expect(wrapper.find('.forge-app__results').exists()).toBe(true)
    expect(wrapper.find('[role="tablist"][aria-label="分析"]').exists()).toBe(true)
    expect(wrapper.get('[data-analysis-panel="next"]').text()).toContain('確認開始記錄後')
    expect(wrapper.find('.recommendation-hint').exists()).toBe(false)
    await wrapper.get('.integrity .button--primary').trigger('click')
    expect(wrapper.find('.forge-app__results').exists()).toBe(true)
    expect(wrapper.get('.recommendation-hint').text()).toContain('建議再抽：目前 0 點')
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('雲端衝突時自動展開帳號與備份並聚焦錯誤訊息', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const store = useForgeStore()
    store.cloudStatus = 'CONFLICT'
    store.cloudMessage = '雲端版本衝突'
    await nextTick()
    await nextTick()

    expect((wrapper.get('[data-account-details]').element as HTMLDetailsElement).open).toBe(true)
    expect(document.activeElement).toBe(wrapper.findAll('.cloud-backup [role="alert"]').at(-1)?.element)
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
  it('重新建立頁面後恢復局中手牌、分數及機率，並說明登入後自動備份', async () => {
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
    expect(restored.get('.recommendation-hint').text()).toContain('再抽期望得分 16.61 分')
    expect(restored.text()).toContain('登入後，牌局會自動備份到你的 GitHub 帳號雲端空間。')
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
    expect((wrapper.get('[data-account-details]').element as HTMLDetailsElement).open).toBe(true)
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

    expect(wrapper.get('h1').text()).toBe('迪特的鐵匠鋪')
  })

  it('首屏標題列簡短顯示記牌狀態並保留手動追蹤說明', async () => {
    const wrapper = mount(App)
    await wrapper.get('.integrity button.button--primary').trigger('click')
    const status = wrapper.get('.forge-workbench__integrity-status')

    expect(status.text()).toBe('記牌完整')
    expect(status.attributes('aria-label')).toBe('記牌完整（手動追蹤）')
    expect(status.attributes('title')).toBe('記牌完整（手動追蹤）')
    wrapper.unmount()
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
    expect(wrapper.get('.recommendation-hint').text()).toContain('建議停手：停手可得 20 分；再抽期望得分 16.61 分。')
    expect(wrapper.findAll('.probability__percent[data-tier-probability]').map((node) => node.text())).toEqual([
      '6.12%', '16.33%', '8.16%', '0.00%', '69.39%',
    ])
    expect(wrapper.get('[aria-label="本局最終等級預估"] [data-forecast-tier-probability="GOOD"]').text())
      .toContain('100.0%')
    const percentageMethod = wrapper.get('button[aria-label="顯示百分比計算方式"]')
    expect(percentageMethod.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).not.toContain('最大餘數法')
    await percentageMethod.trigger('click')
    expect(percentageMethod.attributes('aria-expanded')).toBe('true')
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
    const store = useForgeStore()
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
    const nextForecast = wrapper.get('[aria-label="下一局等級預估"]')
    expect(nextForecast.findAll('[data-forecast-tier-probability]')).toHaveLength(5)
    expect(nextForecast.find('.tier-forecast__estimate').exists()).toBe(false)
    expect(nextForecast.find('.tier-forecast__expected').exists()).toBe(true)
    expect(store.roundForecast).toEqual(
      recommendationDomain.recommendWithinRound([], store.remainingDeck),
    )
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
    expect(document.activeElement).toBe(wrapper.get('.cycle-observation__record[role="status"]').element)
    expect(wrapper.find('[data-tier-probability]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('未確認補滿的進行中牌局，將最終等級預估標示為推定', async () => {
    const wrapper = mount(App)
    const store = prepareRefillCycle()
    await nextTick()
    await wrapper.get('button[aria-label="開始新局"]').trigger('click')
    await wrapper.get('[data-cycle-observation="LATER"]').trigger('click')
    await nextTick()

    expect(store.roundStatus).toBe('ACTIVE')
    expect(wrapper.get('[aria-label="本局最終等級預估"] .tier-forecast__estimate').text())
      .toBe('依補滿規則推定')
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
    expect(wrapper.find('.recommendation-hint').exists()).toBe(false)
    expect(wrapper.text()).toContain('牌池未同步')
    expect(wrapper.text()).toContain('目前不能保證精確機率')
    expect(wrapper.text()).toContain('舊局記錯可從「查看歷史與修正」預覽修正')
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
