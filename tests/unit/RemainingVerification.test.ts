import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RemainingVerification from '../../src/components/RemainingVerification.vue'

describe('RemainingVerification', () => {
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
