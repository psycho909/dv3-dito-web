import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DataManagementPanel from '../../src/components/DataManagementPanel.vue'
import type { BackupSummary, ImportPreview } from '../../src/services/backup'

const summary: BackupSummary = {
  roundCount: 2,
  cycleCount: 1,
  drawCount: 5,
  remainingTotal: 47,
  currentHand: ['A', '4'],
  syncState: 'SYNCED',
}

const incoming: BackupSummary = {
  ...summary,
  roundCount: 3,
  cycleCount: 2,
  drawCount: 8,
  remainingTotal: 44,
  currentHand: ['10'],
  syncState: 'UNSYNCED',
}

const validPreview: ImportPreview = {
  ok: true,
  current: summary,
  incoming,
  fileName: 'save.json',
}

function mountPanel(overrides: Partial<{
  disabled: boolean
  initialized: boolean
  currentSummary: BackupSummary
  importPreview: ImportPreview | null
  notice: string
}> = {}) {
  return mount(DataManagementPanel, {
    props: {
      disabled: false,
      initialized: true,
      currentSummary: summary,
      importPreview: null,
      ...overrides,
    },
    attachTo: document.body,
  })
}

function setSelectedFile(wrapper: VueWrapper, file: File | null) {
  const input = wrapper.get('input[type="file"]').element as HTMLInputElement
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] })
  return wrapper.get('input[type="file"]').trigger('change')
}

function fileWithText(name: string, text: () => Promise<string>, size = 10) {
  const file = new File(['backup'], name, { type: 'application/json' })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  Object.defineProperty(file, 'text', { configurable: true, value: text })
  return file
}

let wrappers: VueWrapper[] = []

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute('open', '') },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) { this.removeAttribute('open') },
  })
})

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount())
  wrappers = []
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

describe('DataManagementPanel', () => {
  it('keeps export unavailable before initialization and emits export only when enabled', async () => {
    const wrapper = mountPanel({ initialized: false })
    wrappers.push(wrapper)
    expect(wrapper.get('section[data-management] h2').text()).toBe('備份與資料管理')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ initialized: true })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('export')).toHaveLength(1)
  })

  it('reads a selected file locally and shows current and incoming backup summaries', async () => {
    const wrapper = mountPanel()
    wrappers.push(wrapper)
    await setSelectedFile(wrapper, fileWithText('保留<文字>.json', async () => '{"schemaVersion":1}'))
    expect(wrapper.emitted('previewImport')).toEqual([[ '{"schemaVersion":1}', '保留<文字>.json' ]])

    await wrapper.setProps({ importPreview: validPreview })
    expect(wrapper.find('[data-import-preview]').exists()).toBe(true)
    expect(wrapper.text()).toContain('此裝置目前紀錄')
    expect(wrapper.text()).toContain('備份：save.json')
    expect(wrapper.text()).toContain('可信度 UNSYNCED')
    expect(wrapper.find('h4').text()).toBe('此裝置目前紀錄')
    expect(wrapper.html()).not.toContain('<文字>')
  })

  it('does not apply an import before confirmation and sends only one event after confirming', async () => {
    const wrapper = mountPanel({ importPreview: validPreview })
    wrappers.push(wrapper)
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
    await wrapper.get('button.data-management__button--apply').trigger('click')
    expect(wrapper.emitted('applyImport')).toBeUndefined()
    expect(wrapper.get('button.data-management__button--apply').text()).toBe('套用匯入備份')
    expect(wrapper.get('.confirm-dialog h2').text()).toBe('覆蓋本機紀錄？')
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(true)
    await wrapper.get('.confirm-dialog__button--confirm').trigger('click')
    expect(wrapper.emitted('applyImport')).toHaveLength(1)
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
  })

  it('cancels a destructive confirmation without emitting its action', async () => {
    const wrapper = mountPanel()
    wrappers.push(wrapper)
    await wrapper.get('button.data-management__button--danger').trigger('click')
    expect(wrapper.get('.confirm-dialog h2').text()).toBe('重置為 52 顆牌池？')
    await wrapper.get('.confirm-dialog').trigger('cancel')
    expect(wrapper.emitted('resetDeck')).toBeUndefined()
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
  })

  it.each([
    ['重置牌池', '重置為 52 顆牌池？', 'resetDeck'],
    ['只清除此裝置資料', '清除此裝置紀錄？', 'clearLocal'],
  ] as const)('requires final confirmation before %s', async (label, title, eventName) => {
    const wrapper = mountPanel()
    wrappers.push(wrapper)
    await wrapper.findAll('button').find((button) => button.text() === label)?.trigger('click')
    expect(wrapper.get('.confirm-dialog h2').text()).toBe(title)
    expect(wrapper.emitted(eventName)).toBeUndefined()
    await wrapper.get('.confirm-dialog__button--confirm').trigger('click')
    expect(wrapper.emitted(eventName)).toHaveLength(1)
  })

  it('rejects oversized files before reading and clears the selection on removal', async () => {
    const text = vi.fn(async () => '{}')
    const wrapper = mountPanel()
    wrappers.push(wrapper)
    await setSelectedFile(wrapper, fileWithText('large.json', text, 5 * 1024 * 1024 + 1))
    expect(text).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('超過 5 MiB')
    expect(document.activeElement).toBe(wrapper.get('input[type="file"]').element)
    await wrapper.findAll('button').find((node) => node.text() === '移除選取備份')?.trigger('click')
    expect(wrapper.emitted('cancelImport')).toHaveLength(2)
  })

  it('associates a parent validation error with the file field and focuses it', async () => {
    const wrapper = mountPanel({ importPreview: { ok: false, error: '備份格式不正確。' } })
    wrappers.push(wrapper)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const input = wrapper.get('input[type="file"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')?.split(' ')).toContain('backup-file-error')
    expect(wrapper.get('[data-import-preview][role="alert"]').text()).toContain('備份格式不正確')
    expect(document.activeElement).toBe(input.element)
  })

  it('ignores a superseded file read and keeps the latest filename', async () => {
    let resolveOld!: (value: string) => void
    const oldRead = new Promise<string>((resolve) => { resolveOld = resolve })
    const wrapper = mountPanel()
    wrappers.push(wrapper)
    await setSelectedFile(wrapper, fileWithText('old.json', () => oldRead))
    await setSelectedFile(wrapper, fileWithText('new.json', async () => '{"new":true}'))
    resolveOld('{"old":true}')
    await Promise.resolve()
    await Promise.resolve()
    expect(wrapper.emitted('previewImport')).toEqual([[ '{"new":true}', 'new.json' ]])
    expect(wrapper.text()).toContain('已選取：new.json')
  })

  it('invalidates a pending read when reset is confirmed and clears the selected filename', async () => {
    let resolveRead!: (value: string) => void
    const pendingRead = new Promise<string>((resolve) => { resolveRead = resolve })
    const wrapper = mountPanel()
    wrappers.push(wrapper)
    await setSelectedFile(wrapper, fileWithText('pending.json', () => pendingRead))
    expect(wrapper.text()).toContain('已選取：pending.json')

    await wrapper.get('button.data-management__button--danger').trigger('click')
    await wrapper.get('.confirm-dialog__button--confirm').trigger('click')
    expect(wrapper.emitted('resetDeck')).toHaveLength(1)
    expect(wrapper.emitted('cancelImport')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('已選取：pending.json')

    resolveRead('{"late":true}')
    await Promise.resolve()
    await Promise.resolve()
    expect(wrapper.emitted('previewImport')).toBeUndefined()
  })

  it('surfaces read failures and ignores work completed after unmount', async () => {
    const wrapper = mountPanel()
    wrappers.push(wrapper)
    await setSelectedFile(wrapper, fileWithText('bad.json', async () => { throw new Error('read') }))
    expect(wrapper.get('[role="alert"]').text()).toContain('無法讀取')
    expect(document.activeElement).toBe(wrapper.get('input[type="file"]').element)

    let resolveAfterUnmount!: (value: string) => void
    const lateRead = new Promise<string>((resolve) => { resolveAfterUnmount = resolve })
    await setSelectedFile(wrapper, fileWithText('late.json', () => lateRead))
    wrapper.unmount()
    resolveAfterUnmount('{}')
    await Promise.resolve()
    expect(wrapper.emitted('previewImport')).toBeUndefined()
  })
})
