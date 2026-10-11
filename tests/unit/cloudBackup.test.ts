import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import CloudBackupStatus from '../../src/components/CloudBackupStatus.vue'
import { createGameState, gameReducer } from '../../src/domain/gameReducer'
import { loadPersistedGame, savePersistedGame, serializePersistedSession } from '../../src/services/persistence'
import { useForgeStore } from '../../src/stores/forgeStore'
import { forgeCloudRepository } from '../../src/services/forgeCloudRepository'

vi.mock('../../src/services/forgeCloudRepository', () => ({
  forgeCloudRepository: { read: vi.fn(), commit: vi.fn(), delete: vi.fn() },
}))
const userId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  globalThis.localStorage.clear()
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
  vi.mocked(forgeCloudRepository.read).mockResolvedValue(null)
})

async function enabledStore() {
  const store = useForgeStore()
  store.startRecording()
  store.setCloudUser(userId)
  await store.prepareCloudBackup()
  await store.confirmCloudBackup()
  return store
}

function exportConflict(store: ReturnType<typeof useForgeStore>) {
  const backup = store.exportConflictBackup()
  if (!backup) throw new Error('No conflict backup')
  store.confirmConflictBackupDownloaded(backup.stamp)
  return backup
}

describe('GitHub backup sync', () => {
  it('provides an explicit comparison action instead of overwriting on conflict', async () => {
    const store = await enabledStore()
    store.cloudStatus = 'CONFLICT'
    const wrapper = mount(CloudBackupStatus)
    expect(wrapper.text()).toContain('比較兩端版本')
    wrapper.unmount()
  })
  it('keeps 4/7/6 offline across reload without changing deck sync', async () => {
    const store = await enabledStore()
    for (const rank of ['4', '7', '6'] as const) store.recordDraw(rank)
    expect(store.currentScore).toBe(17)
    expect(store.remainingTotal).toBe(49)
    expect(store.integrity).toBe('SYNCED')
    expect(store.cloudStatus).toBe('OFFLINE_PENDING')
    const ids = JSON.parse(store.rawStoredData!).pendingMutationBatches.map((batch: { mutationId: string }) => batch.mutationId)
    setActivePinia(createPinia())
    const restored = useForgeStore()
    expect(restored.currentHand).toEqual(['4', '7', '6'])
    expect(restored.pendingCloudCount).toBe(4)
    expect(JSON.parse(restored.rawStoredData!).pendingMutationBatches.map((batch: { mutationId: string }) => batch.mutationId)).toEqual(ids)
  })

  it('retries the same mutation after timeout and drains in order', async () => {
    const store = await enabledStore()
    store.recordDraw('4')
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.commit).mockRejectedValueOnce(new Error('timeout'))
    await store.syncCloud()
    const first = vi.mocked(forgeCloudRepository.commit).mock.calls[0]![1]
    expect(store.pendingCloudCount).toBe(2)
    vi.mocked(forgeCloudRepository.commit).mockImplementation(async (_user, batch) => ({ status: 'COMMITTED', revision: batch.expectedRevision + 1 }))
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 2, state: loadPersistedGame().ok ? storeState(store.rawStoredData!) : null, deletedAt: null })
    await store.syncCloud()
    expect(vi.mocked(forgeCloudRepository.commit).mock.calls[1]![1]).toEqual(first)
    expect(store.pendingCloudCount).toBe(0)
    expect(store.cloudStatus).toBe('BACKED_UP')
  })

  it('preserves new input arriving while the head batch is awaiting acknowledgement', async () => {
    const store = await enabledStore()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    let acknowledge!: (value: { status: 'COMMITTED'; revision: number }) => void
    vi.mocked(forgeCloudRepository.commit).mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve }))
    vi.mocked(forgeCloudRepository.commit).mockRejectedValue(new Error('offline'))
    const syncing = store.syncCloud()
    store.recordDraw('7')
    acknowledge({ status: 'COMMITTED', revision: 1 })
    await syncing
    expect(store.pendingCloudCount).toBe(1)
    expect(store.currentHand).toEqual(['7'])
    expect(JSON.parse(store.rawStoredData!).pendingMutationBatches[0].expectedRevision).toBe(1)
  })

  it('retains pending data on account switch and does not upload it to the new UID', async () => {
    const store = await enabledStore()
    store.setCloudUser('22222222-2222-4222-8222-222222222222')
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    await store.syncCloud()
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
    expect(store.pendingCloudCount).toBe(1)
    expect(store.cloudStatus).toBe('ERROR')
    expect(store.clearLocalData()).toBe(false)
  })

  it('stops at conflict without changing local state or consuming the queue', async () => {
    const store = await enabledStore()
    store.recordDraw('6')
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.commit).mockResolvedValue({ status: 'VERSION_CONFLICT', revision: 9 })
    const raw = store.rawStoredData
    await store.syncCloud()
    expect(store.cloudStatus).toBe('CONFLICT')
    expect(store.rawStoredData).toBe(raw)
    expect(store.currentHand).toEqual(['6'])
    await store.syncCloud()
    expect(forgeCloudRepository.commit).toHaveBeenCalledTimes(1)
  })

  it('never overwrites an existing remote when first enabling with local history', async () => {
    const store = useForgeStore()
    store.startRecording()
    store.setCloudUser(userId)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 1, state: storeState(store.rawStoredData!), deletedAt: null })
    await store.prepareCloudBackup()
    expect(store.cloudStatus).toBe('CONFLICT')
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
  })

  it('downloads a validated remote only after confirmation and preserves its account/revision', async () => {
    const original = await enabledStore()
    original.recordDraw('4')
    const remoteState = storeState(original.rawStoredData!)
    globalThis.localStorage.clear()
    setActivePinia(createPinia())
    const store = useForgeStore()
    store.setCloudUser(userId)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 3, state: remoteState, deletedAt: null })
    await store.prepareCloudBackup()
    expect(store.currentHand).toEqual([])
    expect(store.cloudPreview?.kind).toBe('restore')
    await store.confirmCloudBackup()
    expect(store.currentHand).toEqual(['4'])
    expect(JSON.parse(store.rawStoredData!).cloudAccountId).toBe(userId)
    expect(JSON.parse(store.rawStoredData!).lastAcknowledgedCloudRevision).toBe(3)
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
  })

  it('logs refill boundaries, observations and remaining verification in order', async () => {
    const store = await enabledStore()
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      for (let copy = 0; copy < 4; copy++) store.recordDraw(rank)
    }
    store.recordDraw('10')
    store.recordDraw('10')
    store.finishRound()
    store.startRound()
    store.confirmCycleObservation('CONFIRMED_52')
    store.verifyRemaining(52)
    const events = JSON.parse(store.rawStoredData!).pendingMutationBatches.flatMap((batch: { actions: unknown[] }) => batch.actions)
    expect(events.slice(-3)).toMatchObject([
      { type: 'START_ROUND', payload: { cycleCreated: { reason: 'BELOW_15_NEXT_ROUND', previousRemaining: 14 } } },
      { type: 'CONFIRM_CYCLE_OBSERVATION', payload: { observation: 'CONFIRMED_52' } },
      { type: 'VERIFY_REMAINING', payload: { gameRemaining: 52, toolRemaining: 52, matched: true } },
    ])
    setActivePinia(createPinia())
    const restored = useForgeStore()
    expect(restored.persistenceStatus).toBe('READY')
    expect(restored.currentCycle?.observation).toBe('CONFIRMED_52')
    expect(restored.remainingTotal).toBe(52)
  })

  it('records complete finish and correction payloads while preserving the queue', async () => {
    const store = await enabledStore()
    store.recordDraw('4')
    store.recordDraw('7')
    store.finishRound()
    store.previewHistoryCorrection({ roundId: store.rounds[0]!.id, draws: ['4', '6'], reason: '第二顆誤記' })
    expect(store.applyHistoryCorrection()).toBe(true)
    const events = JSON.parse(store.rawStoredData!).pendingMutationBatches.flatMap((batch: { actions: unknown[] }) => batch.actions)
    expect(events.at(-2)).toMatchObject({ type: 'FINISH_ROUND', payload: { finalScore: 11, tier: 'NORMAL', remainingAfter: 50 } })
    expect(events.at(-1)).toMatchObject({ type: 'CORRECT_HISTORY', payload: {
      before: ['4', '7'], after: ['4', '6'], reason: '第二顆誤記', boundaryChanges: [],
    } })
  })

  it('leaves an actionable error when the account switches during a zero-pending remote read', async () => {
    const store = await enabledStore()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.commit).mockResolvedValue({ status: 'COMMITTED', revision: 1 })
    const remote = { revision: 1, state: storeState(store.rawStoredData!), deletedAt: null }
    vi.mocked(forgeCloudRepository.read).mockResolvedValue(remote)
    await store.syncCloud()
    let resolveRead!: (value: typeof remote) => void
    vi.mocked(forgeCloudRepository.read).mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve }))
    const syncing = store.syncCloud()
    store.setCloudUser('22222222-2222-4222-8222-222222222222')
    resolveRead(remote)
    await syncing
    expect(store.pendingCloudCount).toBe(0)
    expect(store.cloudStatus).toBe('ERROR')
    expect(store.cloudMessage).toContain('原 GitHub 帳號')
  })

  it('keeps previously acknowledged zero-pending data distinct from pending when a read loses connectivity', async () => {
    const store = await enabledStore()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.commit).mockResolvedValue({ status: 'COMMITTED', revision: 1 })
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 1, state: storeState(store.rawStoredData!), deletedAt: null })
    await store.syncCloud()
    vi.mocked(forgeCloudRepository.read).mockImplementationOnce(async () => {
      vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
      throw new Error('connection lost')
    })
    await store.syncCloud()
    expect(store.pendingCloudCount).toBe(0)
    expect(store.cloudStatus).toBe('BACKED_UP')
  })

  it('keeps local input and unlocks retry when it changes while restore is awaiting the remote', async () => {
    const original = await enabledStore()
    const remote = { revision: 2, state: storeState(original.rawStoredData!), deletedAt: null }
    globalThis.localStorage.clear()
    setActivePinia(createPinia())
    const store = useForgeStore()
    store.setCloudUser(userId)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue(remote)
    await store.prepareCloudBackup()
    let resolveRead!: (value: typeof remote) => void
    vi.mocked(forgeCloudRepository.read).mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve }))
    const confirming = store.confirmCloudBackup()
    store.startRecording()
    store.recordDraw('7')
    resolveRead(remote)
    await confirming
    expect(store.currentHand).toEqual(['7'])
    expect(store.cloudStatus).toBe('DISABLED')
    expect(store.cloudPreview).toBeNull()
  })

  it('keeps the original queue until a new overwrite mutation is acknowledged and retries its ID after reload', async () => {
    const store = await enabledStore()
    store.recordDraw('4')
    const remote = { revision: 5, state: storeState(store.rawStoredData!), deletedAt: null }
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    store.cloudStatus = 'CONFLICT'
    vi.mocked(forgeCloudRepository.read).mockResolvedValue(remote)
    await store.refreshCloudConflict()
    const original = JSON.parse(store.rawStoredData!).pendingMutationBatches
    const backup = exportConflict(store)
    expect(JSON.parse(backup.raw).localEnvelope.pendingMutationBatches).toEqual(original)
    vi.mocked(forgeCloudRepository.commit).mockRejectedValueOnce(new Error('timeout'))
    await store.chooseCloudVersion('local')
    const planned = JSON.parse(store.rawStoredData!).conflictResolution.batch
    expect(planned.expectedRevision).toBe(5)
    expect(original.some((batch: { mutationId: string }) => batch.mutationId === planned.mutationId)).toBe(false)
    expect(JSON.parse(store.rawStoredData!).pendingMutationBatches).toEqual(original)
    setActivePinia(createPinia())
    const restored = useForgeStore()
    vi.mocked(forgeCloudRepository.commit).mockResolvedValue({ status: 'COMMITTED', revision: 6 })
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ ...remote, revision: 6 })
    restored.setCloudUser(userId)
    await vi.waitFor(() => expect(restored.cloudStatus).toBe('BACKED_UP'))
    expect(vi.mocked(forgeCloudRepository.commit).mock.calls.at(-1)![1].mutationId).toBe(planned.mutationId)
    expect(restored.pendingCloudCount).toBe(0)
    expect(restored.currentHand).toEqual(['4'])
  })

  it('preserves new inputs added during overwrite acknowledgement and rebases only those unsent batches', async () => {
    const store = await enabledStore()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    store.cloudStatus = 'CONFLICT'
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 4, state: storeState(store.rawStoredData!), deletedAt: null })
    await store.refreshCloudConflict()
    exportConflict(store)
    let acknowledge!: (value: { status: 'COMMITTED'; revision: number }) => void
    vi.mocked(forgeCloudRepository.commit).mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve }))
    vi.mocked(forgeCloudRepository.commit).mockRejectedValue(new Error('temporary outage'))
    const choosing = store.chooseCloudVersion('local')
    await vi.waitFor(() => expect(store.cloudStatus).toBe('SAVING'))
    store.recordDraw('7')
    acknowledge({ status: 'COMMITTED', revision: 5 })
    await choosing
    expect(store.currentHand).toEqual(['7'])
    const envelope = JSON.parse(store.rawStoredData!)
    expect(envelope.pendingMutationBatches).toHaveLength(1)
    expect(envelope.pendingMutationBatches[0].expectedRevision).toBe(5)
  })

  it('requires an up-to-date downloaded backup before accepting the cloud version', async () => {
    const store = await enabledStore()
    const remote = { revision: 3, state: storeState(store.rawStoredData!), deletedAt: null }
    store.recordDraw('6')
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    store.cloudStatus = 'CONFLICT'
    vi.mocked(forgeCloudRepository.read).mockResolvedValue(remote)
    await store.refreshCloudConflict()
    await store.chooseCloudVersion('remote')
    expect(store.currentHand).toEqual(['6'])
    exportConflict(store)
    await store.chooseCloudVersion('remote')
    expect(store.currentHand).toEqual([])
    expect(store.pendingCloudCount).toBe(0)
    expect(store.cloudStatus).toBe('BACKED_UP')
  })

  it('keeps local data on offline or failed deletion and clears it only on confirmed DELETED', async () => {
    const store = await enabledStore()
    store.recordDraw('4')
    const original = store.rawStoredData
    await store.prepareCloudDelete()
    expect(store.cloudDeletePreview).toBeNull()
    expect(store.rawStoredData).toBe(original)
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 2, state: storeState(original!), deletedAt: null })
    await store.prepareCloudDelete()
    vi.mocked(forgeCloudRepository.delete).mockRejectedValueOnce(new Error('timeout'))
    await store.confirmCloudDelete()
    expect(store.rawStoredData).toBe(original)
    expect(store.currentHand).toEqual(['4'])
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 3, state: null, deletedAt: '2026-10-12T00:00:00.000Z' })
    await store.prepareCloudDelete()
    vi.mocked(forgeCloudRepository.delete).mockResolvedValue({ status: 'DELETED', revision: 3 })
    await store.confirmCloudDelete()
    expect(store.rawStoredData).toBeNull()
    expect(store.pendingCloudCount).toBe(0)
    expect(store.integrity).toBe('UNINITIALIZED')
    expect(store.cloudMessage).toContain('墓碑')
  })

  it('starts a new cycle explicitly after a tombstone and never revives the deleted local history', async () => {
    const store = await enabledStore()
    store.recordDraw('6')
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 9, state: null, deletedAt: '2026-10-12T00:00:00.000Z' })
    store.cloudStatus = 'CONFLICT'
    await store.refreshCloudConflict()
    exportConflict(store)
    vi.mocked(forgeCloudRepository.commit).mockImplementationOnce(async (_uid, batch) => {
      expect(batch.reviveDeleted).toBe(true)
      expect(batch.expectedRevision).toBe(9)
      expect((batch.resultingSession as { rounds: { draws: string[] }[] }).rounds[0]!.draws).toEqual([])
      const parsed = loadPersistedGame({ getItem: () => JSON.stringify({
        session: batch.resultingSession, deviceId: '00000000-0000-4000-8000-000000000000', lastAcknowledgedCloudRevision: 0, pendingMutationBatches: [],
      }), setItem: () => {} })
      if (!parsed.ok) throw new Error('Invalid fresh state')
      vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 10, state: parsed.state, deletedAt: null })
      return { status: 'COMMITTED', revision: 10 }
    })
    await store.chooseCloudVersion('local')
    expect(store.currentHand).toEqual([])
    expect(store.rounds).toHaveLength(1)
    expect(store.remainingTotal).toBe(52)
    expect(store.pendingCloudCount).toBe(0)
  })

  it('reports partial deletion accurately when the server confirms but local removal fails', async () => {
    const store = await enabledStore()
    store.recordDraw('4')
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 1, state: storeState(store.rawStoredData!), deletedAt: null })
    await store.prepareCloudDelete()
    vi.mocked(forgeCloudRepository.delete).mockResolvedValue({ status: 'DELETED', revision: 2 })
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage denied') })
    await store.confirmCloudDelete()
    remove.mockRestore()
    expect(store.currentHand).toEqual(['4'])
    expect(store.persistenceStatus).toBe('ERROR')
    expect(store.cloudStatus).toBe('ERROR')
    expect(store.cloudMessage).toContain('雲端遊戲歷史已刪除')
    expect(store.cloudMessage).toContain('本機清除失敗')
  })

  it('does not race an automatic upload with a confirmed deletion and ignores an old-account acknowledgement', async () => {
    const store = await enabledStore()
    store.recordDraw('4')
    const original = store.rawStoredData
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 1, state: storeState(original!), deletedAt: null })
    await store.prepareCloudDelete()
    let confirmDeletion!: (value: { status: 'DELETED'; revision: number }) => void
    vi.mocked(forgeCloudRepository.delete).mockImplementationOnce(() => new Promise((resolve) => { confirmDeletion = resolve }))
    const deleting = store.confirmCloudDelete()
    await store.syncCloud()
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
    expect(store.recordDraw('7')).toBe(false)
    store.setCloudUser('22222222-2222-4222-8222-222222222222')
    confirmDeletion({ status: 'DELETED', revision: 2 })
    await deleting
    expect(store.rawStoredData).toBe(original)
    expect(store.currentHand).toEqual(['4'])
    expect(store.cloudStatus).toBe('ERROR')
  })
})

function storeState(raw: string) {
  const result = loadPersistedGame({ getItem: () => raw, setItem: () => {} })
  if (!result.ok) throw new Error(result.error)
  return result.state
}

describe('cloud queue persistence', () => {
  it('saves the session and pending batch atomically and restores them after reload', () => {
    let raw: string | null = null
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value } }
    const state = gameReducer(createGameState(), {
      type: 'START_ROUND', roundId: 'r1', cycleId: 'c1', startedAt: '2026-10-11T00:00:00.000Z',
    })
    const metadata = {
      cloudAccountId: '11111111-1111-4111-8111-111111111111', lastAcknowledgedCloudRevision: 0,
      pendingMutationBatches: [{
        mutationId: '22222222-2222-4222-8222-222222222222', expectedRevision: 0,
        actions: [{ eventId: '33333333-3333-4333-8333-333333333333', type: 'CONFIRM_FULL_DECK', at: '2026-10-11T00:00:00.000Z', payload: { roundId: 'r1', cycleId: 'c1' } }],
        resultingSession: JSON.parse(serializePersistedSession(state)),
      }],
    }
    expect(savePersistedGame(state, null, storage, metadata).ok).toBe(true)
    expect(JSON.parse(raw!).pendingMutationBatches).toEqual(metadata.pendingMutationBatches)
    expect(loadPersistedGame(storage).ok).toBe(true)
  })
})
