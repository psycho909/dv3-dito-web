import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useForgeStore } from '../../src/stores/forgeStore'

beforeEach(() => setActivePinia(createPinia()))

describe('記牌工作階段', () => {
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
})
