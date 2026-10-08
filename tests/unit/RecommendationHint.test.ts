import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RecommendationHint from '../../src/components/RecommendationHint.vue'
import type { RecommendationReason } from '../../src/domain/recommendation'

describe('RecommendationHint', () => {
  it('0 點再抽建議說明下一顆不會爆牌', () => {
    const wrapper = mount(RecommendationHint, {
      props: {
        recommendation: { action: 'DRAW', reason: 'CLOSER_TO_21' },
        currentScore: 0,
        estimated: false,
      },
    })
    expect(wrapper.text()).toContain('建議再抽：目前 0 點，下一顆不會爆牌。')
  })

  it('shows the draw and stop comparison, marks an estimated cycle, and never offers an action', () => {
    const wrapper = mount(RecommendationHint, {
      props: {
        recommendation: {
          action: 'STOP',
          reason: 'BURST_RISK',
          withinRound: { stopDistance: 4, drawExpectedDistance: 15.755102040816325 },
        },
        currentScore: 17,
        estimated: true,
      },
    })

    expect(wrapper.text()).toContain('建議停手')
    expect(wrapper.text()).toContain('停在 17，距 21 差 4')
    expect(wrapper.text()).toContain('再抽平均差 15.76')
    expect(wrapper.text()).toContain('推定')
    expect(wrapper.text()).toContain('以最終點數接近 21 為目標，不代表獎勵最高')
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.get('[aria-live="polite"]').exists()).toBe(true)
  })

  it.each<[RecommendationReason, string]>([
    ['NOT_SYNCED', '牌池未同步，無法提供建議。'],
    ['EMPTY_DECK', '牌池沒有剩餘石頭，無法提供建議。'],
    ['COMPUTATION_LIMIT', '目前無法計算建議'],
    ['AT_21', '目前是 21 點，沒有建議動作。'],
    ['BURST', '目前已爆牌，沒有建議動作。'],
  ])('%s 顯示原因，保留目標說明且不提供動作', (reason, message) => {
    const wrapper = mount(RecommendationHint, {
      props: {
        recommendation: { action: 'NONE', reason },
        currentScore: 21,
        estimated: false,
      },
    })
    expect(wrapper.get('.recommendation-hint__message').text()).toBe(message)
    expect(wrapper.text()).not.toMatch(/建議再抽|建議停手|NaN|Infinity/)
    expect(wrapper.text()).toContain('以最終點數接近 21 為目標，不代表獎勵最高')
    expect(wrapper.findAll('button, a, [tabindex]')).toHaveLength(0)
    expect(wrapper.find('.recommendation-hint__estimate').exists()).toBe(false)
  })

  it('DRAW、STOP、NONE 原地更新固定 polite region 且不奪走操作焦點', async () => {
    const control = document.createElement('button')
    document.body.append(control)
    const wrapper = mount(RecommendationHint, {
      attachTo: document.body,
      props: {
        recommendation: { action: 'DRAW', reason: 'CLOSER_TO_21', withinRound: { stopDistance: 10, drawExpectedDistance: 5.5 } },
        currentScore: 11,
        estimated: false,
      },
    })
    const liveRegion = wrapper.get('[aria-live="polite"]').element
    expect(wrapper.get('[aria-live="polite"]').text()).not.toContain('以最終點數接近 21 為目標')
    control.focus()
    expect(wrapper.text()).toContain('建議再抽：停手距 21 差 10，再抽平均差 5.50。')
    await wrapper.setProps({ recommendation: { action: 'STOP', reason: 'BURST_RISK', withinRound: { stopDistance: 4, drawExpectedDistance: 15.755102040816325 } }, currentScore: 17 })
    expect(wrapper.text()).toContain('建議停手')
    await wrapper.setProps({ recommendation: { action: 'NONE', reason: 'NOT_SYNCED' } })
    expect(wrapper.get('[aria-live="polite"]').element).toBe(liveRegion)
    expect(wrapper.text()).toContain('牌池未同步，無法提供建議。')
    expect(document.activeElement).toBe(control)
    wrapper.unmount()
    control.remove()
  })
})
