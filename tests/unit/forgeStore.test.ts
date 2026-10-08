import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useForgeStore } from '../../src/stores/forgeStore'
import { LOCAL_STORAGE_KEY } from '../../src/services/persistence'

beforeEach(() => {
  localStorage.removeItem(LOCAL_STORAGE_KEY)
  setActivePinia(createPinia())
})
afterEach(() => vi.restoreAllMocks())

describe('記牌工作階段', () => {
  it('空白資料以 READY 啟動，第一次接受的變更才寫入 envelope', () => {
    const store = useForgeStore()

    expect(store.persistenceStatus).toBe('READY')
    expect(store.persistenceError).toBeNull()
    expect(store.rawStoredData).toBeNull()
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull()

    expect(store.startRecording()).toBe(true)
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? 'null')).toMatchObject({
      session: { schemaVersion: 1, syncState: 'SYNCED', rounds: [{ status: 'ACTIVE', draws: [] }] },
      lastAcknowledgedCloudRevision: 0,
      pendingMutationBatches: [],
    })
  })

  it('保存失敗不發布新狀態；ERROR 鎖定操作並可明確重讀恢復', () => {
    const store = useForgeStore()
    expect(store.startRecording()).toBe(true)
    const savedBeforeFailure = localStorage.getItem(LOCAL_STORAGE_KEY)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    expect(store.recordDraw('4')).toBe(false)
    expect(store.persistenceStatus).toBe('ERROR')
    expect(store.persistenceError).toEqual(expect.any(String))
    expect(store.rawStoredData).toBe(savedBeforeFailure)
    expect(store.currentHand).toEqual([])
    expect(store.canRecord).toBe(false)
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBe(savedBeforeFailure)
    expect(store.finishRound()).toBe(false)
    expect(store.recordDraw('4')).toBe(false)

    setItem.mockRestore()
    expect(store.retryPersistence()).toBe(true)
    expect(store.persistenceStatus).toBe('READY')
    expect(store.persistenceError).toBeNull()
    expect(store.recordDraw('4')).toBe(true)
    expect(store.currentHand).toEqual(['4'])
  })

  it('建立 store 時讀取失敗會鎖住操作，retry 重新讀取後恢復', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage disabled', 'SecurityError')
    })
    const store = useForgeStore()

    expect(store.persistenceStatus).toBe('ERROR')
    expect(store.persistenceError).toEqual(expect.any(String))
    expect(store.rawStoredData).toBeNull()
    expect(store.startRecording()).toBe(false)
    expect(store.canRecord).toBe(false)

    getItem.mockRestore()
    expect(store.retryPersistence()).toBe(true)
    expect(store.persistenceStatus).toBe('READY')
    expect(store.startRecording()).toBe(true)
  })

  it('偵測其他 store 先寫入後拒絕覆蓋，retry 載入外部分頁的新資料', () => {
    const firstStore = useForgeStore()
    expect(firstStore.startRecording()).toBe(true)
    setActivePinia(createPinia())
    const staleStore = useForgeStore()
    const staleRaw = staleStore.rawStoredData

    expect(firstStore.recordDraw('4')).toBe(true)
    const externalRaw = localStorage.getItem(LOCAL_STORAGE_KEY)
    expect(staleStore.recordDraw('7')).toBe(false)
    expect(staleStore.persistenceStatus).toBe('ERROR')
    expect(staleStore.currentHand).toEqual([])
    expect(staleStore.rawStoredData).toBe(externalRaw)
    expect(externalRaw).not.toBe(staleRaw)

    expect(staleStore.retryPersistence()).toBe(true)
    expect(staleStore.persistenceStatus).toBe('READY')
    expect(staleStore.currentHand).toEqual(['4'])
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBe(externalRaw)
  })

  it('確認從完整牌池開始後才啟用記錄', () => {
    const store = useForgeStore()
    expect(store.integrity).toBe('UNINITIALIZED')
    expect(store.startRecording()).toBe(true)
    expect(store.integrity).toBe('SYNCED')
  })

  it('T02：紀錄 4、7、6 後從事件推導分數 17 與剩餘 49', () => {
    const store = useForgeStore()
    store.startRecording()
    expect(store.recordDraw('4')).toBe(true)
    expect(store.remainingTotal).toBe(51)
    store.recordDraw('7')
    expect(store.remainingTotal).toBe(50)
    store.recordDraw('6')
    expect(store.currentScore).toBe(17)
    expect(store.remainingTotal).toBe(49)
    expect(store.currentHand).toEqual(['4', '7', '6'])
    expect(store.remainingDeck['4']).toBe(3)
  })

  it('未確認時拒絕記錄，不產生抽牌事件', () => {
    const store = useForgeStore()
    expect(store.recordDraw('A')).toBe(false)
    expect(store.currentHand).toEqual([])
    expect(store.integrity).toBe('UNINITIALIZED')
  })

  it('T10：拒絕用罄點數與重複確認，不清除既有紀錄', () => {
    const store = useForgeStore()
    store.startRecording()
    for (let i = 0; i < 4; i++) expect(store.recordDraw('4')).toBe(true)
    expect(store.recordDraw('4')).toBe(false)
    expect(store.remainingDeck['4']).toBe(0)
    expect(store.remainingTotal).toBe(48)
    expect(store.startRecording()).toBe(false)
    expect(store.currentHand).toEqual(['4', '4', '4', '4'])
  })

  it('T17：耗盡牌池後維持空牌池，不自動補滿', () => {
    const store = useForgeStore()
    store.startRecording()
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const) {
      const count = rank === '10' ? 16 : 4
      for (let i = 0; i < count; i++) expect(store.recordDraw(rank)).toBe(true)
    }
    expect(store.remainingTotal).toBe(0)
    expect(store.nextDraw.isComputable).toBe(false)
    if (!store.nextDraw.isComputable) expect(store.nextDraw.reason).toBe('EMPTY_DECK')
    expect(store.recordDraw('10')).toBe(false)
    expect(store.currentHand).toHaveLength(52)
  })

  it('AC-07：只撤銷 ACTIVE 本局輸入，恢復 11 分、剩 50', () => {
    const store = useForgeStore()
    expect(store.undoDraw()).toBeNull()
    store.startRecording()
    store.recordDraw('4')
    store.recordDraw('7')
    store.recordDraw('6')
    expect(store.canUndoDraw).toBe(true)
    expect(store.undoDraw()).toBe('6')
    expect(store.currentHand).toEqual(['4', '7'])
    expect(store.currentScore).toBe(11)
    expect(store.remainingTotal).toBe(50)
    expect(store.remainingDeck['6']).toBe(4)
    store.undoDraw()
    store.undoDraw()
    expect(store.canUndoDraw).toBe(false)
    expect(store.undoDraw()).toBeNull()
    expect(store.remainingTotal).toBe(52)
  })

  it('AC-02：完成本局保留結果，新局歸零並承接 49 顆', () => {
    const store = useForgeStore()
    expect(store.finishRound()).toBe(false)
    expect(store.startRound()).toBe(false)
    store.startRecording()
    for (const rank of ['4', '7', '6'] as const) store.recordDraw(rank)
    expect(store.startRound()).toBe(false)
    expect(store.finishRound()).toBe(true)
    expect(store.roundStatus).toBe('FINISHED')
    expect(store.canRecord).toBe(false)
    expect(store.canUndoDraw).toBe(false)
    expect(store.currentScore).toBe(17)
    expect(store.currentHand).toEqual(['4', '7', '6'])
    expect(store.remainingTotal).toBe(49)
    expect(store.recordDraw('2')).toBe(false)
    expect(store.undoDraw()).toBeNull()
    expect(store.finishRound()).toBe(false)
    expect(store.startRound()).toBe(true)
    expect(store.roundStatus).toBe('ACTIVE')
    expect(store.currentScore).toBe(0)
    expect(store.currentHand).toEqual([])
    expect(store.remainingTotal).toBe(49)
    expect(store.remainingDeck).toMatchObject({ '4': 3, '7': 3, '6': 3 })
    expect(store.undoDraw()).toBeNull()
    expect(store.recordDraw('6')).toBe(true)
    expect(store.remainingTotal).toBe(48)
    expect(store.undoDraw()).toBe('6')
    expect(store.remainingTotal).toBe(49)
    expect(store.rounds[0].draws).toEqual(['4', '7', '6'])
  })

  it('空局可完成；空牌池只在下一局開始才補滿', () => {
    const store = useForgeStore()
    store.startRecording()
    expect(store.finishRound()).toBe(true)
    expect(store.startRound()).toBe(true)
    expect(store.remainingTotal).toBe(52)
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const) {
      const count = rank === '10' ? 16 : 4
      for (let i = 0; i < count; i++) store.recordDraw(rank)
    }
    expect(store.remainingTotal).toBe(0)
    expect(store.finishRound()).toBe(true)
    expect(store.startRound()).toBe(true)
    expect(store.currentScore).toBe(0)
    expect(store.remainingTotal).toBe(52)
    expect(store.remainingDeck['10']).toBe(16)
    expect(store.undoDraw()).toBeNull()
    expect(store.rounds[1].draws).toHaveLength(52)
    expect(store.recordDraw('10')).toBe(true)
    expect(store.remainingTotal).toBe(51)
  })

  it('T12／T13／T21：局中剩 14 不補，下一局補滿並保留週期紀錄', () => {
    const store = useForgeStore()
    store.startRecording()
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      for (let i = 0; i < 4; i++) store.recordDraw(rank)
    }
    store.recordDraw('10')
    store.recordDraw('10')
    expect(store.remainingTotal).toBe(14)
    expect(store.expectedRefill).toBe(true)
    store.finishRound()
    store.startRound()
    expect(store.currentHand).toEqual([])
    expect(store.remainingTotal).toBe(52)
    expect(store.remainingDeck['10']).toBe(16)
    expect(store.remainingDeck.A).toBe(4)
    expect(store.cycles).toHaveLength(2)
    expect(store.currentCycle).toMatchObject({ reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 })
    expect(store.currentCycle?.triggeredByRoundId).toBe(store.rounds[1].id)
    expect(store.recordDraw('A')).toBe(true)
    expect(store.remainingTotal).toBe(51)
    expect(store.rounds[0].draws).toHaveLength(38)
  })

  it('T32：不是只記錄觀察與 UNSYNCED，不猜修正庫存或重新初始化', () => {
    const store = useForgeStore()
    store.startRecording()
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      for (let i = 0; i < 4; i++) store.recordDraw(rank)
    }
    store.recordDraw('10')
    store.recordDraw('10')
    store.finishRound()
    store.startRound()
    const cycleId = store.currentCycle?.id
    expect(store.currentCycle?.observation).toBeUndefined()
    expect(store.confirmCycleObservation('DENIED')).toBe(true)
    expect(store.integrity).toBe('UNSYNCED')
    expect(store.currentCycle).toMatchObject({ id: cycleId, observation: 'DENIED' })
    expect(store.currentCycle?.observedAt).toEqual(expect.any(String))
    expect(store.remainingTotal).toBe(52)
    expect(store.startRecording()).toBe(false)
    expect(store.confirmCycleObservation('CONFIRMED_52')).toBe(false)
    expect(store.recordDraw('4')).toBe(true)
    expect(store.remainingTotal).toBe(51)
    expect(store.undoDraw()).toBe('4')
    expect(store.remainingTotal).toBe(52)
    store.finishRound()
    store.startRound()
    expect(store.integrity).toBe('UNSYNCED')
    expect(store.currentCycle?.observation).toBe('DENIED')
  })

  it('T11：剩 15 換局保留原週期與庫存，不要求補滿觀察', () => {
    const store = useForgeStore()
    store.startRecording()
    const cycleId = store.currentCycle?.id
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      for (let i = 0; i < 4; i++) store.recordDraw(rank)
    }
    store.recordDraw('10')
    expect(store.remainingTotal).toBe(15)
    expect(store.expectedRefill).toBe(false)
    store.finishRound()
    store.startRound()
    expect(store.remainingTotal).toBe(15)
    expect(store.cycles).toHaveLength(1)
    expect(store.currentCycle?.id).toBe(cycleId)
    expect(store.remainingDeck['10']).toBe(15)
    expect(store.confirmCycleObservation('CONFIRMED_52')).toBe(false)
  })
})
