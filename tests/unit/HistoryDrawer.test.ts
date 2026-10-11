import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import HistoryDrawer from '../../src/components/HistoryDrawer.vue'
import { INITIAL_DECK } from '../../src/domain'
import type { HistoryPreview } from '../../src/domain/historyCorrection'

const rounds = [{ id: 'round-1', cycleId: 'cycle-1', status: 'FINISHED', draws: ['7', '8'], startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:01:00.000Z' }] as const
const cycles = [{ id: 'cycle-1', initialDeck: INITIAL_DECK, startedAt: '2026-01-01T00:00:00.000Z', reason: 'USER_CONFIRMED_FULL' }] as const

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})

describe('HistoryDrawer', () => {
  it('keeps the closed dialog hidden despite its open-state flex layout', () => {
    const wrapper = mount(HistoryDrawer, {
      props: { open: false, rounds, cycles, preview: null },
    })

    expect(wrapper.get('dialog').attributes('open')).toBeUndefined()
    expect(getComputedStyle(wrapper.get('dialog').element).display).toBe('none')
    wrapper.unmount()
  })

  it('shows history and validates an edit before requesting a preview', async () => {
    const wrapper = mount(HistoryDrawer, {
      props: {
        rounds,
        cycles,
        preview: null,
        open: false,
      },
    })
    await wrapper.setProps({ open: true })

    expect(wrapper.text()).toContain('歷史紀錄')
    await wrapper.get('button[aria-label="修正第 1 局"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[role="alert"]').text()).toContain('請輸入 1 到 500 字的修正原因')
    expect(wrapper.emitted('preview')).toBeUndefined()
  })

  it('submits the complete rank sequence and reason for parent-owned preview', async () => {
    const wrapper = mount(HistoryDrawer, {
      props: {
        rounds,
        cycles,
        preview: null,
        open: false,
      },
    })
    await wrapper.setProps({ open: true })
    await wrapper.get('button[aria-label="修正第 1 局"]').trigger('click')
    await wrapper.get('textarea[aria-label="抽牌序列"]').setValue('A, 10')
    await wrapper.get('input[aria-label="修正原因"]').setValue('補回記漏的抽牌')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('preview')?.[0]).toEqual([{ roundId: 'round-1', draws: ['A', '10'], reason: '補回記漏的抽牌' }])
    wrapper.unmount()
  })

  it('opens on the newest page and asks before closing a changed draft', async () => {
    const manyRounds = Array.from({ length: 12 }, (_, index) => ({
      ...rounds[0],
      id: `round-${index + 1}`,
    }))
    const wrapper = mount(HistoryDrawer, {
      props: { open: false, rounds: manyRounds, cycles, preview: null },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })

    expect(wrapper.text()).toContain('第 12 局')
    expect(wrapper.text()).toContain('第 3 局')
    expect(wrapper.text()).not.toContain('第 2 局')
    await wrapper.get('button[aria-label="修正第 12 局"]').trigger('click')
    await wrapper.get('textarea[aria-label="抽牌序列"]').setValue('7 9')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await wrapper.get('dialog').trigger('cancel')

    expect(wrapper.text()).toContain('放棄未套用修正並關閉')
    await wrapper.findAll('button').find((button) => button.text() === '繼續編輯')?.trigger('click')
    expect(document.activeElement).toBe(wrapper.get('textarea').element)
    await wrapper.get('dialog').trigger('cancel')
    await wrapper.findAll('button').find((button) => button.text() === '放棄未套用修正並關閉')?.trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    await nextTick()
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('shows an explicit UTC timezone in each audit timestamp', async () => {
    const wrapper = mount(HistoryDrawer, {
      props: {
        open: false,
        rounds,
        cycles,
        preview: null,
        corrections: [{
          id: 'correction-1',
          correctedAt: '2026-10-11T09:00:00.000Z',
          roundId: 'round-1',
          beforeDraws: ['7', '8'],
          afterDraws: ['7', '9'],
          reason: '修正誤記',
          boundaryChanges: [],
          warnings: [],
        }],
      },
    })
    await wrapper.get('details summary').trigger('click')

    expect(wrapper.get('.history-drawer__audit-item').text()).toContain('[UTC]')
  })

  it('returns focus to the corrected round after the parent confirms apply', async () => {
    const wrapper = mount(HistoryDrawer, {
      props: { open: false, rounds, cycles, preview: null, notice: '' },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    await wrapper.get('button[aria-label="修正第 1 局"]').trigger('click')
    await wrapper.get('textarea[aria-label="抽牌序列"]').setValue('7 9')
    await wrapper.get('input[aria-label="修正原因"]').setValue('修正誤記')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('preview')).toHaveLength(1)
    expect(wrapper.get('[data-history-edit="round-1"]').element.dataset.historyEdit).toBe('round-1')

    await wrapper.setProps({ notice: '已套用修正，所有回合與牌池已重新推算。' })
    await nextTick()

    expect(wrapper.find('form').exists()).toBe(false)
    expect((document.activeElement as HTMLButtonElement).dataset.historyEdit).toBe('round-1')
    wrapper.unmount()
  })

  it('keeps apply explicit for warnings and omits it for a rejected preview', async () => {
    const wrapper = mount(HistoryDrawer, {
      props: { open: false, rounds, cycles, preview: null },
    })
    await wrapper.setProps({ open: true })
    await wrapper.get('button[aria-label="修正第 1 局"]').trigger('click')
    const warningPreview = {
      ok: true,
      nextState: {
        rounds: [{ ...rounds[0], draws: ['A', '10'] }],
        cycles,
        syncState: 'SYNCED',
      },
      affectedRounds: [],
      boundaryChanges: [],
      warnings: [{ cycleId: 'cycle-1', roundId: 'round-1', previousRemaining: 14, message: '已確認邊界保持不動' }],
      remainingDeck: INITIAL_DECK,
      remainingTotal: 52,
      syncState: 'SYNCED',
    } satisfies HistoryPreview
    await wrapper.setProps({ preview: warningPreview })

    const applyButton = wrapper.get('button.history-drawer__apply')
    expect(applyButton.text()).toBe('仍套用修正並保留此邊界')
    await applyButton.trigger('click')
    expect(wrapper.emitted('apply')).toHaveLength(1)

    await wrapper.setProps({ preview: { ok: false, error: '重播超抽', conflictRoundId: 'round-1' } })
    expect(wrapper.get('[role="alert"]').text()).toContain('第 1 局')
    expect(wrapper.get('[role="alert"]').text()).toContain('重播超抽')
    expect(wrapper.find('button.history-drawer__apply').exists()).toBe(false)
    wrapper.unmount()
  })
})
