import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RemainingVerification from '../../src/components/RemainingVerification.vue'

describe('RemainingVerification', () => {
  it('未同步時說明可輸入當下總數並保留 DENIED 與點數組成風險', () => {
    const wrapper = mount(RemainingVerification, {
      props: { verifiedRemainingCount: 48, toolRemaining: 49, integrity: 'UNSYNCED' },
    })

    expect(wrapper.get('[role="status"]').text()).toContain('上次回報 48 顆，工具依紀錄推算 49 顆')
    expect(wrapper.get('[role="status"]').text()).toContain('總數相同不代表各點數都正確')
    expect(wrapper.get('[role="status"]').text()).toContain('最近一次補滿確認回答「不是 52 顆」')
    expect(wrapper.get('.remaining-verification__help').text()).toContain('之後尚未確認新的補滿或手動重置')
    expect(wrapper.get('summary').text()).toContain('上次回報 48 顆')
  })

  it('emits a valid remaining count and clears a prior validation error', async () => {
    const wrapper = mount(RemainingVerification, {
      props: { verifiedRemainingCount: null },
    })
    await wrapper.get('summary').trigger('click')
    const input = wrapper.get('input')
    await input.setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('請輸入 0 到 52 的整數')

    await input.setValue('48')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('verify')).toEqual([[48]])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each(['', ' ', '4.5', '-1', '53', 'abc'])('rejects invalid input %j and keeps it focused', async (value) => {
    const wrapper = mount(RemainingVerification, {
      props: { verifiedRemainingCount: null },
      attachTo: document.body,
    })
    await wrapper.get('summary').trigger('click')
    const input = wrapper.get('input')
    await input.setValue(value)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('verify')).toBeUndefined()
    expect(document.activeElement).toBe(input.element)
    const error = wrapper.get('[role="alert"]')
    expect(input.attributes('aria-describedby')?.split(' ')).toContain(error.attributes('id'))
    expect(input.attributes('aria-invalid')).toBe('true')
    wrapper.unmount()
  })
})
