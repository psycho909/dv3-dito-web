/* global HTMLDialogElement */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import VersionHistoryDialog from '../../src/components/VersionHistoryDialog.vue'
import type { VersionRelease } from '../../src/domain/versionHistory'

const releases: VersionRelease[] = [{
  version: '1.5.0',
  date: '2026-10-12',
  sections: {
    Added: ['網站頁尾顯示版本紀錄。'],
    Changed: [],
    Fixed: [],
  },
}]

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() { this.setAttribute('open', '') },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() { this.removeAttribute('open') },
  })
})

describe('VersionHistoryDialog', () => {
  it('opens with focus inside and Escape closes it and restores focus', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const wrapper = mount(VersionHistoryDialog, {
      attachTo: document.body,
      props: { open: false, releases },
    })
    await wrapper.setProps({ open: true })
    await nextTick()
    await nextTick()

    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="關閉版本紀錄"]').element)
    expect(wrapper.get('h3').text()).toBe('v1.5.0')

    const cancelEvent = new Event('cancel', { cancelable: true })
    wrapper.get('dialog').element.dispatchEvent(cancelEvent)
    await nextTick()
    await nextTick()

    expect(cancelEvent.defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    await wrapper.setProps({ open: false })
    await nextTick()
    await nextTick()
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
    trigger.remove()
  })
})
