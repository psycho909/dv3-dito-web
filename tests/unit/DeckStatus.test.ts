import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeckStatus from '../../src/components/DeckStatus.vue'

describe('DeckStatus', () => {
  it('explains that 15 remaining stones will refill next round', () => {
    const wrapper = mount(DeckStatus, { props: { remainingTotal: 15 } })
    expect(wrapper.get('button').attributes('aria-label')).toBe('剩餘牌池 15 / 52，剩 15，下局預計補滿')
    expect(wrapper.text()).toBe('剩 15 / 52')
    expect(wrapper.get('button').attributes('title')).toContain('下局預計補滿')
  })
})
