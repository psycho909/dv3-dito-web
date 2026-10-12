import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import CloudBackupStatus from '../../src/components/CloudBackupStatus.vue'
import { createGameState, gameReducer } from '../../src/domain/gameReducer'
import { loadPersistedGame, parsePersistedSession, savePersistedGame, serializePersistedSession } from '../../src/services/persistence'
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
  await vi.waitFor(() => expect(store.pendingCloudCount).toBe(1))
  return store
}

function sessionState(draws: ('A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10')[] = []) {
  const roundId = '11111111-1111-4111-8111-111111111111'
  let state = gameReducer(createGameState(), {
    type: 'START_ROUND', roundId, cycleId: '22222222-2222-4222-8222-222222222222', startedAt: '2026-10-12T00:00:00.000Z',
  })
  for (const rank of draws) state = gameReducer(state, { type: 'RECORD_DRAW', roundId, rank })
  return state
}

function decodeBatchSession(batch: { resultingSession: unknown }) {
  const parsed = parsePersistedSession(JSON.stringify(batch.resultingSession))
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.state
}

describe('automatic GitHub backup setup', () => {
  it('uploads existing local history after login without a confirmation step', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    let remote: { revision: number; state: ReturnType<typeof createGameState>; deletedAt: null } | null = null
    vi.mocked(forgeCloudRepository.read).mockImplementation(async () => remote)
    vi.mocked(forgeCloudRepository.commit).mockImplementation(async (_account, batch) => {
      remote = { revision: batch.expectedRevision + 1, state: decodeBatchSession(batch), deletedAt: null }
      return { status: 'COMMITTED', revision: remote.revision }
    })

    const store = useForgeStore()
    store.startRecording()
    store.recordDraw('4')
    store.setCloudUser(userId)

    await vi.waitFor(() => expect(store.cloudStatus).toBe('BACKED_UP'))
    expect(forgeCloudRepository.commit).toHaveBeenCalledTimes(1)
    expect(forgeCloudRepository.commit).toHaveBeenCalledWith(userId, expect.objectContaining({
      expectedRevision: 0,
      actions: [expect.objectContaining({ type: 'IMPORT_OVERWRITE' })],
    }))
    expect(remote?.state.rounds[0]?.draws).toEqual(['4'])
  })

  it('downloads remote history automatically when the local device is uninitialized', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    const remote = { revision: 4, state: sessionState(['7']), deletedAt: null }
    vi.mocked(forgeCloudRepository.read).mockResolvedValue(remote)
    const store = useForgeStore()

    store.setCloudUser(userId)

    await vi.waitFor(() => expect(store.currentHand).toEqual(['7']))
    expect(JSON.parse(store.rawStoredData!).cloudAccountId).toBe(userId)
    expect(JSON.parse(store.rawStoredData!).lastAcknowledgedCloudRevision).toBe(4)
    expect(store.cloudStatus).toBe('BACKED_UP')
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
  })

  it.each([
    ['live remote history', { revision: 3, state: sessionState(['7']), deletedAt: null }],
    ['a remote tombstone', { revision: 9, state: null, deletedAt: '2026-10-12T00:00:00.000Z' }],
  ] as const)('keeps local history in conflict when login finds %s', async (_case, remote) => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue(remote)
    const store = useForgeStore()
    store.startRecording()
    store.recordDraw('6')
    const local = store.rawStoredData

    store.setCloudUser(userId)

    await vi.waitFor(() => expect(store.cloudStatus).toBe('CONFLICT'))
    expect(store.rawStoredData).toBe(local)
    expect(store.currentHand).toEqual(['6'])
    expect(JSON.parse(store.rawStoredData!).cloudAccountId).toBeUndefined()
    expect(store.cloudConflict?.accountId).toBe(userId)
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
  })

  it.each([
    ['no remote row', null, 0, false],
    ['a tombstone', { revision: 9, state: null, deletedAt: '2026-10-12T00:00:00.000Z' }, 9, true],
  ] as const)('binds an empty local device to %s without upload, then syncs its first recording', async (_case, initialRemote, expectedRevision, reviveDeleted) => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    let remote = initialRemote
    vi.mocked(forgeCloudRepository.read).mockImplementation(async () => remote)
    vi.mocked(forgeCloudRepository.commit).mockImplementation(async (_account, batch) => {
      remote = { revision: batch.expectedRevision + 1, state: decodeBatchSession(batch), deletedAt: null }
      return { status: 'COMMITTED', revision: remote.revision }
    })
    const store = useForgeStore()

    store.setCloudUser(userId)
    await vi.waitFor(() => expect(JSON.parse(store.rawStoredData!).cloudAccountId).toBe(userId))
    expect(store.integrity).toBe('UNINITIALIZED')
    expect(store.pendingCloudCount).toBe(0)
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()

    store.startRecording()
    await vi.waitFor(() => expect(['ERROR', 'BACKED_UP']).toContain(store.cloudStatus))
    if (store.cloudStatus !== 'BACKED_UP') throw new Error(`Automatic tombstone recovery failed: ${store.cloudMessage}`)
    expect(forgeCloudRepository.commit).toHaveBeenCalledTimes(1)
    expect(forgeCloudRepository.commit).toHaveBeenCalledWith(userId, expect.objectContaining({
      expectedRevision,
      ...(reviveDeleted ? { reviveDeleted: true } : {}),
      actions: [expect.objectContaining({ type: reviveDeleted ? 'OVERWRITE_CLOUD_FROM_LOCAL' : 'CONFIRM_FULL_DECK' })],
    }))
  })

  it('re-reads and snapshots the newest local state when it changes during initial discovery', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    let releaseFirstRead!: (value: null) => void
    let remote: { revision: number; state: ReturnType<typeof createGameState>; deletedAt: null } | null = null
    vi.mocked(forgeCloudRepository.read)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirstRead = resolve }))
      .mockImplementation(async () => remote)
    vi.mocked(forgeCloudRepository.commit).mockImplementation(async (_account, batch) => {
      remote = { revision: batch.expectedRevision + 1, state: decodeBatchSession(batch), deletedAt: null }
      return { status: 'COMMITTED', revision: remote.revision }
    })
    const store = useForgeStore()
    store.startRecording()
    store.setCloudUser(userId)
    await vi.waitFor(() => expect(forgeCloudRepository.read).toHaveBeenCalledTimes(1))

    store.recordDraw('4')
    releaseFirstRead(null)

    await vi.waitFor(() => expect(store.cloudStatus).toBe('BACKED_UP'))
    expect(forgeCloudRepository.read).toHaveBeenCalledTimes(3)
    expect(remote?.state.rounds[0]?.draws).toEqual(['4'])
  })

  it('ignores an old account discovery when the login changes before the read returns', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    const otherUserId = '22222222-2222-4222-8222-222222222222'
    let releaseOldRead!: (value: null) => void
    let remote: { revision: number; state: ReturnType<typeof createGameState>; deletedAt: null } | null = null
    vi.mocked(forgeCloudRepository.read)
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOldRead = resolve }))
      .mockImplementation(async () => remote)
    vi.mocked(forgeCloudRepository.commit).mockImplementation(async (_account, batch) => {
      remote = { revision: batch.expectedRevision + 1, state: decodeBatchSession(batch), deletedAt: null }
      return { status: 'COMMITTED', revision: remote.revision }
    })
    const store = useForgeStore()
    store.startRecording()
    store.setCloudUser(userId)
    await vi.waitFor(() => expect(forgeCloudRepository.read).toHaveBeenCalledTimes(1))

    store.setCloudUser(otherUserId)
    await vi.waitFor(() => expect(store.cloudStatus).toBe('BACKED_UP'))
    releaseOldRead(null)
    await Promise.resolve()

    expect(vi.mocked(forgeCloudRepository.commit).mock.calls.map(([account]) => account)).toEqual([otherUserId])
    expect(JSON.parse(store.rawStoredData!).cloudAccountId).toBe(otherUserId)
  })

  it('queues an initial local snapshot offline and sends it after reconnecting', async () => {
    const store = useForgeStore()
    store.startRecording()
    store.recordDraw('4')

    store.setCloudUser(userId)

    await vi.waitFor(() => expect(store.cloudStatus).toBe('OFFLINE_PENDING'))
    expect(store.pendingCloudCount).toBe(1)
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    let remote: { revision: number; state: ReturnType<typeof createGameState>; deletedAt: null } | null = null
    vi.mocked(forgeCloudRepository.read).mockImplementation(async () => remote)
    vi.mocked(forgeCloudRepository.commit).mockImplementation(async (_account, batch) => {
      remote = { revision: batch.expectedRevision + 1, state: decodeBatchSession(batch), deletedAt: null }
      return { status: 'COMMITTED', revision: remote.revision }
    })

    await store.syncCloud()

    expect(store.cloudStatus).toBe('BACKED_UP')
    expect(store.pendingCloudCount).toBe(0)
    expect(forgeCloudRepository.commit).toHaveBeenCalledTimes(1)
    expect(remote?.state.rounds[0]?.draws).toEqual(['4'])
  })
})

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
    expect(store.cloudAccountId).toBe(userId)
    store.setCloudUser('22222222-2222-4222-8222-222222222222')
    expect(store.cloudAccountId).toBe(userId)
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    await store.syncCloud()
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
    expect(store.cloudAccountId).toBe(userId)
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

  it('never overwrites an existing remote when login finds local history', async () => {
    const store = useForgeStore()
    store.startRecording()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 1, state: storeState(store.rawStoredData!), deletedAt: null })
    store.setCloudUser(userId)
    await vi.waitFor(() => expect(store.cloudStatus).toBe('CONFLICT'))
    expect(store.cloudStatus).toBe('CONFLICT')
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
  })

  it('downloads a validated remote automatically when the local device is empty', async () => {
    const original = await enabledStore()
    original.recordDraw('4')
    const remoteState = storeState(original.rawStoredData!)
    globalThis.localStorage.clear()
    setActivePinia(createPinia())
    const store = useForgeStore()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    vi.mocked(forgeCloudRepository.read).mockResolvedValue({ revision: 3, state: remoteState, deletedAt: null })
    store.setCloudUser(userId)
    await vi.waitFor(() => expect(store.currentHand).toEqual(['4']))
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

  it('does not restore over local input entered while the initial remote read is pending', async () => {
    const original = await enabledStore()
    const remote = { revision: 2, state: storeState(original.rawStoredData!), deletedAt: null }
    globalThis.localStorage.clear()
    setActivePinia(createPinia())
    const store = useForgeStore()
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true)
    let resolveRead!: (value: typeof remote) => void
    vi.mocked(forgeCloudRepository.read).mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve }))
    vi.mocked(forgeCloudRepository.read).mockResolvedValue(remote)
    store.setCloudUser(userId)
    await vi.waitFor(() => expect(forgeCloudRepository.read).toHaveBeenCalledTimes(1))
    store.startRecording()
    store.recordDraw('7')
    resolveRead(remote)
    await vi.waitFor(() => expect(store.cloudStatus).toBe('CONFLICT'))
    expect(store.currentHand).toEqual(['7'])
    expect(JSON.parse(store.rawStoredData!).cloudAccountId).toBeUndefined()
    expect(forgeCloudRepository.commit).not.toHaveBeenCalled()
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
