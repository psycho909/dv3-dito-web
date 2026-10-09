import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeckStatus from '../../src/components/DeckStatus.vue'

describe('DeckStatus', () => {
  it('explains that 15 remaining stones do not meet the refill condition', () => {
    const wrapper = mount(DeckStatus, { props: { remainingTotal: 15 } })
    expect(wrapper.get('button').attributes('aria-label')).toBe('剩餘牌池 15 / 52，剩 15，尚未達補滿條件')
    expect(wrapper.text()).toContain('剩 15，尚未達補滿條件')
  })
})
