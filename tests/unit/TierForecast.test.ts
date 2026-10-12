import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TierForecast from '../../src/components/TierForecast.vue'
import type { Recommendation } from '../../src/domain/recommendation'

const forecast: Recommendation = {
  action: 'DRAW',
  reason: 'HIGHER_EXPECTED_SCORE',
  forecast: {
    expectedScore: 34.22,
    tierDistribution: { PERFECT: 0.116, GREAT: 0.299, GOOD: 0.374, NORMAL: 0, BURST: 0.211 },
  },
}

describe('TierForecast', () => {
  it('shows all five final tiers, expected score, and the stated policy assumption', () => {
    const wrapper = mount(TierForecast, {
      props: { phase: 'current', recommendation: forecast, estimated: false },
    })

    expect(wrapper.get('[aria-label="本局最終等級預估"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-forecast-tier-probability]')).toHaveLength(5)
    expect(wrapper.get('[data-forecast-tier-probability="PERFECT"]').text()).toContain('11.6%')
    expect(wrapper.get('[data-forecast-tier-probability="GREAT"]').text()).toContain('29.9%')
    expect(wrapper.get('[data-forecast-tier-probability="GOOD"]').text()).toContain('37.4%')
    expect(wrapper.get('[data-forecast-tier-probability="NORMAL"]').text()).toContain('0.0%')
    expect(wrapper.get('[data-forecast-tier-probability="BURST"]').text()).toContain('21.1%')
    expect(wrapper.text()).toContain('期望得分 34.22 分')
    expect(wrapper.text()).toContain('假設之後照建議操作')
    expect(wrapper.find('[data-testid="multiplier-forecast"]').exists()).toBe(false)
  })

  it('keeps the next-round forecast focused on tier outcomes; multiplier references live in the token tab', () => {
    const wrapper = mount(TierForecast, {
      props: {
        phase: 'next',
        recommendation: {
          ...forecast,
          forecast: { ...forecast.forecast!, expectedScore: 36.62 },
        },
        estimated: false,
      },
    })
    expect(wrapper.get('[aria-label="下一局等級預估"]').text()).toContain('期望得分 36.62 分')
    expect(wrapper.find('[data-testid="multiplier-forecast"]').exists()).toBe(false)
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/最賺|保證/)
  })

  it('marks the next-round forecast that uses the refill rule', () => {
    const wrapper = mount(TierForecast, {
      props: { phase: 'next', recommendation: forecast, estimated: true },
    })

    expect(wrapper.get('[aria-label="下一局等級預估"]').text()).toContain('依補滿規則推定')
  })

  it.each([
    ['NOT_SYNCED', '牌池未同步'],
    ['EMPTY_DECK', '牌池沒有剩餘石頭'],
    ['COMPUTATION_LIMIT', '計算超過上限'],
  ] as const)('%s hides all forecast numbers and explains why', (reason, message) => {
    const wrapper = mount(TierForecast, {
      props: {
        phase: 'current',
        recommendation: { action: 'NONE', reason },
        estimated: false,
      },
    })

    expect(wrapper.text()).toContain(message)
    expect(wrapper.findAll('[data-forecast-tier-probability]')).toHaveLength(0)
    expect(wrapper.find('[data-forecast-expected-score]').exists()).toBe(false)
  })
})
