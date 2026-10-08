import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import { useForgeStore } from '../../src/stores/forgeStore'

beforeEach(() => setActivePinia(createPinia()))

describe('App', () => {
  it('顯示工具名稱', () => {
    const wrapper = mount(App)

    expect(wrapper.get('h1').text()).toBe('迪特的鐵匠鋪機率計算器')
  })

  it('未確認前不顯示推算數字且所有點數鍵停用；確認後把焦點移到第一鍵', async () => {
    const wrapper = mount(App, { attachTo: document.body })

    expect(wrapper.find('[data-testid="remaining-total"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-rank-key]')).toHaveLength(10)
    expect(wrapper.findAll('[data-rank-key]').every((button) => (button.element as HTMLButtonElement).disabled)).toBe(true)

    await wrapper.get('button').trigger('click')

    expect(wrapper.find('[data-testid="remaining-total"]').text()).toBe('剩 52')
    expect(document.activeElement).toBe(wrapper.get('[data-rank-key="A"]').element)
    wrapper.unmount()
  })

  it('確認後記錄 4、7、6，顯示 17/21、剩 49 與固定順序的下一顆機率', async () => {
    const wrapper = mount(App)
    await wrapper.get('button').trigger('click')

    await wrapper.get('[data-rank-key="4"]').trigger('click')
    await wrapper.get('[data-rank-key="7"]').trigger('click')
    await wrapper.get('[data-rank-key="6"]').trigger('click')

    expect(wrapper.get('[data-testid="current-score"]').text()).toBe('17/21')
    expect(wrapper.get('[data-testid="remaining-total"]').text()).toBe('剩 49')
    expect(wrapper.findAll('[data-tier-probability]').map((node) => node.text())).toEqual([
      '6.12%', '16.33%', '8.16%', '0.00%', '69.39%',
    ])
    expect(wrapper.text()).toContain('顯示百分比採最大餘數法調整至小數點後兩位，合計 100.00%；比例條依原始機率呈現')
    expect(wrapper.text()).toContain('理論上的下一顆機率，不代表遊戲在 21 點或爆牌後仍允許繼續抽取')
  })

  it('點數用盡後顯示剩 0 並停用該鍵', async () => {
    const wrapper = mount(App)
    const store = useForgeStore()
    store.startRecording()

    for (let draw = 0; draw < 4; draw += 1) store.recordDraw('4')
    await nextTick()

    expect(wrapper.get('[data-rank-key="4"]').text()).toContain('剩 0')
    expect((wrapper.get('[data-rank-key="4"]').element as HTMLButtonElement).disabled).toBe(true)
  })
})
