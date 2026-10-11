import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { calculateNextDraw, classify, RANKS, score, type Rank } from '../domain'
import { recommendWithinRound } from '../domain/recommendation'
import {
  createGameState, deriveCycleDeck, gameReducer, type CycleObservation, type GameAction,
} from '../domain/gameReducer'
import {
  clearPersistedGame, loadPersistedGame, savePersistedGame, readCloudMetadata,
  serializePersistedSession, parsePersistedSession, type CloudMetadata, type PendingMutationBatch,
} from '../services/persistence'
import { forgeCloudRepository, type CloudState } from '../services/forgeCloudRepository'
import {
  parseGameBackup, serializeGameBackup, summarizeGameState, type ImportPreview,
} from '../services/backup'
import {
  previewHistoryCorrection as buildHistoryPreview,
  type HistoryCorrectionRequest, type HistoryEdit, type HistoryPreview,
} from '../domain/historyCorrection'

export const useForgeStore = defineStore('forge', () => {
  const loaded = loadPersistedGame()
  const game = shallowRef(loaded.ok ? loaded.state : createGameState())
  const persistenceStatus = ref<'READY' | 'ERROR'>(loaded.ok ? 'READY' : 'ERROR')
  const persistenceError = ref<string | null>(loaded.ok ? null : loaded.error)
  const rawStoredData = ref<string | null>(loaded.rawStoredData)
  let lastReadRaw = loaded.rawStoredData
  const cloud = shallowRef<CloudMetadata>(readCloudMetadata(loaded.ok ? loaded.rawStoredData : null))
  const cloudUserId = ref<string | null>(null)
  const cloudStatus = ref<'DISABLED' | 'CONNECTING' | 'SAVING' | 'BACKED_UP' | 'OFFLINE_PENDING' | 'ERROR' | 'CONFLICT'>('DISABLED')
  const cloudMessage = ref('')
  const cloudWorking = ref(false)
  const cloudDeleting = ref(false)
  const cloudConflict = shallowRef<{ accountId: string; remote: CloudState | null } | null>(null)
  const cloudDeletePreview = shallowRef<{ userId: string; revision: number; raw: string | null } | null>(null)
  const exportedConflictStamp = ref<string | null>(null)
  const cloudPreview = shallowRef<{ kind: 'upload' | 'restore'; summary: ReturnType<typeof summarizeGameState> } | null>(null)
  let cloudPreviewBase: typeof game.value | null = null
  let cloudPreviewUser: string | null = null
  let remotePreview: CloudState | null = null
  let flushing = false
  let cloudEpoch = 0
  const pendingCloudCount = computed(() => cloud.value.pendingMutationBatches.length + (cloud.value.conflictResolution ? 1 : 0))
  const lastBackupAt = computed(() => cloud.value.lastBackupAt)
  const lastLocalChangeAt = computed(() => cloud.value.lastLocalChangeAt)
  const online = () => typeof navigator === 'undefined' || navigator.onLine

  function persist(next: typeof game.value, metadata: CloudMetadata): boolean {
    const saved = savePersistedGame(next, lastReadRaw, undefined, metadata)
    if (!saved.ok) {
      persistenceStatus.value = 'ERROR'
      persistenceError.value = saved.error
      rawStoredData.value = saved.rawStoredData
      if (metadata.cloudAccountId) cloudStatus.value = 'ERROR'
      return false
    }
    game.value = next
    cloud.value = metadata
    lastReadRaw = saved.rawStoredData
    rawStoredData.value = saved.rawStoredData
    return true
  }

  function batchFor(next: typeof game.value, type: string, payload: unknown): PendingMutationBatch {
    return {
      mutationId: crypto.randomUUID(),
      expectedRevision: cloud.value.lastAcknowledgedCloudRevision + cloud.value.pendingMutationBatches.length,
      actions: [{ eventId: crypto.randomUUID(), type, at: new Date().toISOString(), payload }],
      resultingSession: JSON.parse(serializePersistedSession(next)),
    }
  }

  async function syncCloud() {
    if (cloud.value.conflictResolution) { await submitConflictResolution(); return }
    if (flushing || cloudWorking.value || !cloud.value.cloudAccountId || persistenceStatus.value !== 'READY'
      || cloudStatus.value === 'CONFLICT') return
    const account = cloud.value.cloudAccountId
    if (cloudUserId.value !== account) {
      cloudStatus.value = 'ERROR'
      cloudMessage.value = '請登入原 GitHub 帳號；原帳號的本機與待送紀錄仍保留。'
      return
    }
    if (!online()) {
      cloudStatus.value = pendingCloudCount.value ? 'OFFLINE_PENDING' : cloud.value.lastBackupAt ? 'BACKED_UP' : 'ERROR'
      cloudMessage.value = pendingCloudCount.value ? '' : '目前離線；上次確認的備份仍保留，連線後會重新核對。'
      return
    }
    const epoch = cloudEpoch
    flushing = true
    cloudStatus.value = pendingCloudCount.value ? 'SAVING' : 'CONNECTING'
    cloudMessage.value = ''
    try {
      while (cloud.value.pendingMutationBatches.length) {
        const batch = cloud.value.pendingMutationBatches[0]!
        const result = await forgeCloudRepository.commit(account, batch)
        if (epoch !== cloudEpoch || cloudUserId.value !== account) return
        if (result.status !== 'COMMITTED' || result.revision !== batch.expectedRevision + 1) {
          cloudStatus.value = 'CONFLICT'
          cloudMessage.value = '雲端版本已變更或已刪除；本機與待送紀錄仍保留，請先匯出 JSON。'
          return
        }
        if (persistenceStatus.value !== 'READY') return
        if (!persist(game.value, {
          ...cloud.value, lastAcknowledgedCloudRevision: result.revision,
          pendingMutationBatches: cloud.value.pendingMutationBatches.slice(1), lastBackupAt: new Date().toISOString(),
        })) return
      }
      const remote = await forgeCloudRepository.read(account)
      if (epoch !== cloudEpoch || cloudUserId.value !== account) return
      if (remote?.deletedAt || remote?.revision !== cloud.value.lastAcknowledgedCloudRevision
        || (remote.state && serializePersistedSession(remote.state) !== serializePersistedSession(game.value))) {
        // An action may have queued while the read was in flight; that is pending, not a remote conflict.
        if (pendingCloudCount.value) cloudStatus.value = online() ? 'SAVING' : 'OFFLINE_PENDING'
        else { cloudStatus.value = 'CONFLICT'; cloudMessage.value = '雲端紀錄與本機版本不同；兩端資料都已保留，請先匯出 JSON。' }
      } else cloudStatus.value = pendingCloudCount.value ? 'SAVING' : 'BACKED_UP'
    } catch (error) {
      if (epoch === cloudEpoch) {
        cloudStatus.value = online() ? 'ERROR' : pendingCloudCount.value ? 'OFFLINE_PENDING' : cloud.value.lastBackupAt ? 'BACKED_UP' : 'ERROR'
        cloudMessage.value = error instanceof Error ? error.message : '雲端備份失敗，請重試；本機紀錄仍保留。'
      }
    } finally {
      flushing = false
      if (epoch !== cloudEpoch && cloudUserId.value === account && cloud.value.cloudAccountId === account) {
        cloudStatus.value = 'CONNECTING'
        void syncCloud()
      } else if (cloudStatus.value === 'SAVING' && pendingCloudCount.value) void syncCloud()
    }
  }

  function setCloudUser(userId: string | null) {
    const changed = cloudUserId.value !== userId
    if (changed) {
      cloudEpoch++
      cloudPreview.value = null
      cloudPreviewBase = null
      cloudConflict.value = null
      cloudDeletePreview.value = null
      exportedConflictStamp.value = null
    }
    cloudUserId.value = userId
    if (!cloud.value.cloudAccountId) { cloudStatus.value = 'DISABLED'; return }
    if (userId !== cloud.value.cloudAccountId) {
      cloudStatus.value = 'ERROR'
      cloudMessage.value = '請登入原 GitHub 帳號；原帳號的本機與待送紀錄仍保留。'
      return
    }
    if (changed && cloudStatus.value !== 'CONFLICT') cloudStatus.value = 'CONNECTING'
    void syncCloud()
  }

  async function prepareCloudBackup() {
    if (!cloudUserId.value || persistenceStatus.value !== 'READY' || flushing) return
    if (cloud.value.cloudAccountId) { await syncCloud(); return }
    const userId = cloudUserId.value
    const epoch = cloudEpoch
    const base = game.value
    cloudStatus.value = 'CONNECTING'
    cloudMessage.value = ''
    try {
      const remote = await forgeCloudRepository.read(userId)
      if (epoch !== cloudEpoch) return
      if (game.value !== base) { cloudStatus.value = 'DISABLED'; return }
      if (remote?.deletedAt || (remote && integrity.value !== 'UNINITIALIZED')) {
        cloudConflict.value = { accountId: userId, remote }
        cloudStatus.value = 'CONFLICT'
        cloudMessage.value = '此帳號已有雲端紀錄；不會自動覆蓋，請先匯出本機 JSON。'
        return
      }
      if (!remote && integrity.value === 'UNINITIALIZED') {
        cloudStatus.value = 'DISABLED'; cloudMessage.value = '請先開始記牌，再啟用雲端備份。'; return
      }
      remotePreview = remote
      cloudPreviewBase = base
      cloudPreviewUser = userId
      cloudPreview.value = { kind: remote ? 'restore' : 'upload', summary: summarizeGameState(remote?.state ?? base) }
      cloudStatus.value = 'DISABLED'
    } catch (error) {
      if (epoch === cloudEpoch) { cloudStatus.value = 'ERROR'; cloudMessage.value = error instanceof Error ? error.message : '無法準備雲端備份。' }
    }
  }
  async function refreshCloudConflict() {
    if (flushing || cloudWorking.value || cloud.value.conflictResolution) return
    const userId = cloud.value.cloudAccountId ?? cloudUserId.value
    if (!userId || userId !== cloudUserId.value || !online()) {
      cloudMessage.value = '請連線並登入原 GitHub 帳號，再比較兩端紀錄。'; return
    }
    const epoch = cloudEpoch
    cloudWorking.value = true
    try {
      const remote = await forgeCloudRepository.read(userId)
      if (epoch !== cloudEpoch) return
      cloudConflict.value = { accountId: userId, remote }
      exportedConflictStamp.value = null
      cloudStatus.value = 'CONFLICT'
    } catch (error) { cloudMessage.value = error instanceof Error ? error.message : '比較失敗；原資料仍保留。' }
    finally { cloudWorking.value = false }
  }

  function conflictStamp() { return JSON.stringify({ raw: rawStoredData.value, conflict: cloudConflict.value }) }
  function exportConflictBackup(): { raw: string; stamp: string } | null {
    if (!cloudConflict.value || persistenceStatus.value !== 'READY') return null
    return { stamp: conflictStamp(), raw: JSON.stringify({
      format: 'dito-conflict-backup-v1', exportedAt: new Date().toISOString(),
      localEnvelope: lastReadRaw === null ? null : JSON.parse(lastReadRaw),
      cloud: { ...cloudConflict.value.remote,
        state: cloudConflict.value.remote?.state ? JSON.parse(serializePersistedSession(cloudConflict.value.remote.state)) : null },
    }, null, 2) }
  }
  function confirmConflictBackupDownloaded(stamp: string) {
    if (stamp === conflictStamp()) exportedConflictStamp.value = stamp
  }
  const conflictBackupReady = computed(() => exportedConflictStamp.value === conflictStamp())

  async function chooseCloudVersion(choice: 'local' | 'remote') {
    const conflict = cloudConflict.value
    if (!conflict || conflict.accountId !== cloudUserId.value || !conflictBackupReady.value
      || cloudWorking.value || flushing || persistenceStatus.value !== 'READY' || !online()) {
      cloudMessage.value = '請先連線、匯出最新兩端與待送備份，再確認選擇。'; return
    }
    const epoch = cloudEpoch
    const base = game.value
    cloudWorking.value = true
    try {
      const remote = await forgeCloudRepository.read(conflict.accountId)
      if (epoch !== cloudEpoch) return
      if (game.value !== base || remote?.revision !== conflict.remote?.revision || remote?.deletedAt !== conflict.remote?.deletedAt) {
        cloudConflict.value = { accountId: conflict.accountId, remote }
        exportedConflictStamp.value = null
        cloudMessage.value = '版本已變更，請重新比較與匯出；沒有覆蓋任何資料。'; return
      }
      if (choice === 'remote') {
        if (!remote?.state || remote.deletedAt) { cloudMessage.value = '雲端已刪除或沒有紀錄，不能下載；可明確開始新紀錄。'; return }
        if (!persist(remote.state, { cloudAccountId: conflict.accountId, lastAcknowledgedCloudRevision: remote.revision,
          pendingMutationBatches: [], lastBackupAt: new Date().toISOString(), lastLocalChangeAt: remote.updatedAt })) return
        cloudConflict.value = null
        cloudStatus.value = 'CONNECTING'
      } else {
        const revive = !!remote?.deletedAt
        const next = revive ? gameReducer(createGameState(), {
          type: 'START_ROUND', roundId: crypto.randomUUID(), cycleId: crypto.randomUUID(), startedAt: new Date().toISOString(),
        }) : base
        const batch = { ...batchFor(next, 'OVERWRITE_CLOUD_FROM_LOCAL', { reason: revive ? '使用者確認刪除後重新開始' : '使用者確認保留本機版本' }),
          expectedRevision: remote?.revision ?? 0, ...(revive ? { reviveDeleted: true } : {}) }
        if (!persist(base, { ...cloud.value, cloudAccountId: conflict.accountId,
          conflictResolution: { batch, coveredMutationCount: cloud.value.pendingMutationBatches.length } })) return
      }
    } catch (error) { cloudMessage.value = error instanceof Error ? error.message : '選版尚未確認，原資料仍保留。' }
    finally { cloudWorking.value = false }
    if (cloud.value.conflictResolution) await submitConflictResolution()
    else if (cloudStatus.value === 'CONNECTING') await syncCloud()
  }

  async function submitConflictResolution() {
    const resolution = cloud.value.conflictResolution
    const account = cloud.value.cloudAccountId
    if (!resolution || !account || account !== cloudUserId.value || flushing || cloudWorking.value || persistenceStatus.value !== 'READY') return
    if (!online()) { cloudStatus.value = 'OFFLINE_PENDING'; return }
    const epoch = cloudEpoch
    flushing = true
    cloudStatus.value = 'SAVING'
    try {
      const result = await forgeCloudRepository.commit(account, resolution.batch)
      if (epoch !== cloudEpoch || account !== cloudUserId.value) return
      if (result.status !== 'COMMITTED' || result.revision !== resolution.batch.expectedRevision + 1) {
        if (!persist(game.value, { ...cloud.value, conflictResolution: undefined })) return
        cloudConflict.value = null
        cloudStatus.value = 'CONFLICT'; cloudMessage.value = '雲端再次變更；舊佇列仍保留，請重新比較與匯出。'; return
      }
      const parsed = parsePersistedSession(JSON.stringify(resolution.batch.resultingSession))
      if (!parsed.ok) throw new Error('選定版本驗證失敗，原資料仍保留。')
      const remaining = cloud.value.pendingMutationBatches.slice(resolution.coveredMutationCount)
        .map((batch, index) => ({ ...batch, expectedRevision: result.revision + index }))
      if (!persist(resolution.batch.reviveDeleted ? parsed.state : game.value, {
        ...cloud.value, conflictResolution: undefined, pendingMutationBatches: remaining,
        lastAcknowledgedCloudRevision: result.revision, lastBackupAt: new Date().toISOString(),
        ...(resolution.batch.reviveDeleted ? { lastLocalChangeAt: new Date().toISOString() } : {}),
      })) return
      cloudConflict.value = null
      cloudStatus.value = 'CONNECTING'
    } catch (error) {
      if (epoch === cloudEpoch) {
        cloudStatus.value = online() ? 'ERROR' : 'OFFLINE_PENDING'
        cloudMessage.value = error instanceof Error ? error.message : '覆蓋尚未確認，原佇列與固定批次仍保留，請重試。'
      }
    } finally { flushing = false }
    if (cloudStatus.value === 'CONNECTING') await syncCloud()
  }

  async function prepareCloudDelete() {
    if (flushing || cloudWorking.value || !online() || !cloudUserId.value
      || (cloud.value.cloudAccountId && cloud.value.cloudAccountId !== cloudUserId.value)) {
      cloudMessage.value = '請連線並登入原 GitHub 帳號，完成進行中的上傳後再刪除。'; return
    }
    const userId = cloudUserId.value
    const epoch = cloudEpoch
    const raw = lastReadRaw
    cloudWorking.value = true
    try {
      const remote = await forgeCloudRepository.read(userId)
      if (epoch !== cloudEpoch || raw !== lastReadRaw) return
      cloudDeletePreview.value = { userId, revision: remote?.revision ?? 0, raw }
    } catch (error) { cloudMessage.value = error instanceof Error ? error.message : '無法確認刪除目標，本機未清除。' }
    finally { cloudWorking.value = false }
  }

  async function confirmCloudDelete() {
    const preview = cloudDeletePreview.value
    cloudDeletePreview.value = null
    if (!preview || preview.userId !== cloudUserId.value || preview.raw !== lastReadRaw
      || !online() || cloudWorking.value || flushing || persistenceStatus.value !== 'READY') {
      cloudMessage.value = '連線、身分或紀錄已變更；未刪除，請重新確認。'; return
    }
    const epoch = cloudEpoch
    cloudWorking.value = true
    cloudDeleting.value = true
    try {
      const result = await forgeCloudRepository.delete(preview.userId, preview.revision)
      if (epoch !== cloudEpoch) return
      if (result.status !== 'DELETED') {
        cloudStatus.value = 'CONFLICT'; cloudConflict.value = null; cloudMessage.value = '雲端版本已變更，未清除本機資料。'; return
      }
      const cleared = clearPersistedGame(lastReadRaw)
      if (!cleared.ok) {
        persistenceStatus.value = 'ERROR'; persistenceError.value = cleared.error; rawStoredData.value = cleared.rawStoredData
        cloudStatus.value = 'ERROR'
        cloudMessage.value = '雲端遊戲歷史已刪除並保留墓碑，但本機清除失敗；本機原資料仍保留，請先排除儲存問題並重新讀取。'
        return
      }
      game.value = createGameState()
      cloud.value = readCloudMetadata(null)
      lastReadRaw = null
      rawStoredData.value = null
      cloudEpoch++
      cloudConflict.value = null
      cloudStatus.value = 'DISABLED'
      cloudMessage.value = '遊戲歷史與此裝置紀錄已刪除；伺服器仍保留最小 UID／版本／刪除時間墓碑，GitHub 帳號未刪除。'
      cancelImport(); cancelHistoryCorrection()
    } catch (error) {
      if (epoch === cloudEpoch) { cloudStatus.value = 'ERROR'; cloudMessage.value = error instanceof Error ? error.message : '刪除未確認，本機紀錄與佇列仍保留。' }
    } finally { cloudWorking.value = false; cloudDeleting.value = false }
  }

  async function confirmCloudBackup() {
    if (cloudStatus.value === 'CONNECTING' || cloudStatus.value === 'SAVING') return
    if (!cloudPreview.value || !cloudPreviewUser || cloudUserId.value !== cloudPreviewUser
      || game.value !== cloudPreviewBase || persistenceStatus.value !== 'READY') {
      cloudPreview.value = null; cloudMessage.value = '紀錄或登入身分已變更，請重新準備。'; return
    }
    const userId = cloudPreviewUser
    const kind = cloudPreview.value.kind
    cloudPreview.value = null
    cloudStatus.value = 'CONNECTING'
    if (kind === 'restore') {
      const epoch = cloudEpoch
      const base = game.value
      try {
        const latest = await forgeCloudRepository.read(userId)
        if (epoch !== cloudEpoch) return
        if (game.value !== base) { cloudStatus.value = 'DISABLED'; cloudMessage.value = '本機紀錄已變更，請重新準備。'; return }
        if (!latest?.state || latest.deletedAt || latest.revision !== remotePreview?.revision) {
          cloudStatus.value = 'CONFLICT'; cloudMessage.value = '雲端紀錄已變更，請重新確認。'; return
        }
        if (!persist(latest.state, { cloudAccountId: userId, lastAcknowledgedCloudRevision: latest.revision,
          pendingMutationBatches: [], lastBackupAt: new Date().toISOString() })) return
      } catch { cloudStatus.value = 'ERROR'; cloudMessage.value = '下載失敗，本機紀錄未被覆蓋。'; return }
    } else {
      const first = batchFor(game.value, 'IMPORT_OVERWRITE', { session: JSON.parse(serializePersistedSession(game.value)), reason: '使用者確認首次雲端備份' })
      if (!persist(game.value, { cloudAccountId: userId, lastAcknowledgedCloudRevision: 0, pendingMutationBatches: [first] })) return
    }
    cloudPreview.value = null
    cloudStatus.value = 'CONNECTING'
    await syncCloud()
  }
  const rounds = computed(() => game.value.rounds)
  const cycles = computed(() => game.value.cycles)
  const currentCycle = computed(() => cycles.value.at(-1))
  const currentRound = computed(() => rounds.value.at(-1))
  const integrity = computed(() => game.value.syncState)
  const verifiedRemainingCount = computed(() => game.value.verifiedRemainingCount)
  const corrections = computed(() => game.value.corrections ?? [])
  const historyPreview = shallowRef<HistoryPreview | null>(null)
  let previewBase: typeof game.value | null = null
  let previewRequest: HistoryCorrectionRequest | null = null
  const backupSummary = computed(() => summarizeGameState(game.value))
  const importPreview = shallowRef<ImportPreview | null>(null)
  let importBase: typeof game.value | null = null
  let importState: typeof game.value | null = null
  const roundStatus = computed(() => currentRound.value?.status ?? null)
  const currentHand = computed<readonly Rank[]>(() => currentRound.value?.draws ?? Object.freeze([]))
  const remainingDeck = computed(() => deriveCycleDeck(game.value))
  const currentScore = computed(() => score(currentHand.value))
  const remainingTotal = computed(() => RANKS.reduce((sum, rank) => sum + remainingDeck.value[rank], 0))
  const nextDraw = computed(() => calculateNextDraw(currentHand.value, remainingDeck.value))
  const recommendation = computed(() => {
    if (persistenceStatus.value !== 'READY' || roundStatus.value !== 'ACTIVE') return null
    return recommendWithinRound(currentHand.value, remainingDeck.value, { syncState: integrity.value })
  })
  const canRecord = computed(() => persistenceStatus.value === 'READY'
    && !cloudDeleting.value && !cloud.value.conflictResolution?.batch.reviveDeleted
    && integrity.value !== 'UNINITIALIZED' && roundStatus.value === 'ACTIVE')
  const canUndoDraw = computed(() => canRecord.value && currentHand.value.length > 0)
  const expectedRefill = computed(() => integrity.value !== 'UNINITIALIZED' && remainingTotal.value < 15)

  function dispatch(action: GameAction): boolean {
    if (cloudDeleting.value) { cloudMessage.value = '正在刪除雲端紀錄，請稍後再輸入。'; return false }
    if (cloud.value.conflictResolution?.batch.reviveDeleted) { cloudMessage.value = '重新開始尚未獲伺服器確認，請先重試備份。'; return false }
    if (persistenceStatus.value === 'ERROR') return false
    const next = gameReducer(game.value, action)
    if (next === game.value) return false
    let payload: unknown = action
    if (action.type === 'FINISH_ROUND') payload = {
      ...action, finalScore: currentScore.value, tier: classify(currentScore.value), remainingAfter: remainingTotal.value,
    }
    if (action.type === 'VERIFY_REMAINING') payload = {
      ...action, toolRemaining: remainingTotal.value, matched: action.gameRemaining === remainingTotal.value,
    }
    if (action.type === 'MANUAL_RESET') payload = { ...action, previousRemaining: remainingTotal.value }
    if (action.type === 'CORRECT_HISTORY') {
      const correction = next.corrections!.at(-1)!
      payload = { ...action.request, before: correction.beforeDraws, after: correction.afterDraws,
        boundaryChanges: correction.boundaryChanges, warnings: correction.warnings }
    }
    const metadata = cloud.value.cloudAccountId ? {
      ...cloud.value, pendingMutationBatches: [...cloud.value.pendingMutationBatches,
        batchFor(next, action.type === 'START_ROUND' && game.value.syncState === 'UNINITIALIZED' ? 'CONFIRM_FULL_DECK' : action.type,
          payload)],
      lastLocalChangeAt: new Date().toISOString(),
    } : { ...cloud.value, lastLocalChangeAt: new Date().toISOString() }
    if (!persist(next, metadata)) return false
    if (cloud.value.cloudAccountId) {
      if (cloudStatus.value !== 'CONFLICT') cloudStatus.value = online() ? 'SAVING' : 'OFFLINE_PENDING'
      void syncCloud()
    }
    return true
  }

  function retryPersistence(): boolean {
    cancelHistoryCorrection()
    cancelImport()
    const refreshed = loadPersistedGame()
    if (!refreshed.ok) {
      persistenceStatus.value = 'ERROR'
      persistenceError.value = refreshed.error
      rawStoredData.value = refreshed.rawStoredData ?? rawStoredData.value
      return false
    }
    game.value = refreshed.state
    cloudEpoch++
    cloud.value = readCloudMetadata(refreshed.rawStoredData)
    lastReadRaw = refreshed.rawStoredData
    rawStoredData.value = refreshed.rawStoredData
    persistenceStatus.value = 'READY'
    persistenceError.value = null
    if (cloud.value.cloudAccountId) { cloudStatus.value = 'CONNECTING'; void syncCloud() }
    return true
  }
  function startRecording(): boolean {
    if (integrity.value !== 'UNINITIALIZED') return false
    return dispatch({
      type: 'START_ROUND', roundId: crypto.randomUUID(), cycleId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    })
  }
  function recordDraw(rank: Rank): boolean {
    if (!canRecord.value || !currentRound.value) return false
    return dispatch({ type: 'RECORD_DRAW', roundId: currentRound.value.id, rank })
  }
  function verifyRemaining(gameRemaining: number): boolean {
    return dispatch({ type: 'VERIFY_REMAINING', gameRemaining })
  }
  function exportBackup(): string | null {
    return persistenceStatus.value === 'READY' && integrity.value !== 'UNINITIALIZED'
      ? serializeGameBackup(game.value) : null
  }
  function cancelImport() {
    importPreview.value = null
    importBase = null
    importState = null
  }
  function previewImport(raw: string, fileName: string): ImportPreview {
    cancelImport()
    if (persistenceStatus.value !== 'READY') {
      importPreview.value = { ok: false, error: '請先排除本機儲存錯誤，再預覽匯入。' }
      return importPreview.value
    }
    const parsed = parseGameBackup(raw)
    if (!parsed.ok) {
      importPreview.value = parsed
      return parsed
    }
    importBase = game.value
    importState = parsed.state
    importPreview.value = {
      ok: true, current: summarizeGameState(game.value), incoming: summarizeGameState(parsed.state), fileName,
    }
    return importPreview.value
  }
  function applyImport(): boolean {
    if (pendingCloudCount.value) { importPreview.value = { ok: false, error: '仍有待送紀錄；請先備份並完成同步，再覆蓋匯入。' }; return false }
    if (!importPreview.value?.ok || !importState) return false
    if (importBase !== game.value) {
      importPreview.value = { ok: false, error: '紀錄已變更，請重新預覽備份後再匯入。' }
      importBase = null
      importState = null
      return false
    }
    if (!dispatch({ type: 'IMPORT_OVERWRITE', state: importState })) return false
    cancelImport()
    cancelHistoryCorrection()
    return true
  }
  function resetDeck(): boolean {
    if (pendingCloudCount.value) { cloudMessage.value = '仍有待送紀錄，請先完成同步再手動重置。'; return false }
    if (integrity.value === 'UNINITIALIZED') return false
    if (!dispatch({
      type: 'MANUAL_RESET', roundId: crypto.randomUUID(), cycleId: crypto.randomUUID(),
      resetAt: new Date().toISOString(),
    })) return false
    cancelImport()
    cancelHistoryCorrection()
    return true
  }
  function clearLocalData(): boolean {
    if (flushing || cloudWorking.value || pendingCloudCount.value) { cloudMessage.value = '上傳中或仍有待送紀錄，請先完成同步；本機資料未清除。'; return false }
    if (persistenceStatus.value !== 'READY') return false
    const cleared = clearPersistedGame(lastReadRaw)
    if (!cleared.ok) {
      persistenceStatus.value = 'ERROR'
      persistenceError.value = cleared.error
      rawStoredData.value = cleared.rawStoredData
      return false
    }
    game.value = createGameState()
    cloudEpoch++
    cloud.value = readCloudMetadata(null)
    cloudStatus.value = 'DISABLED'
    cloudPreview.value = null
    lastReadRaw = null
    rawStoredData.value = null
    cancelImport()
    cancelHistoryCorrection()
    return true
  }
  function previewHistoryCorrection(edit: HistoryEdit): HistoryPreview {
    if (persistenceStatus.value !== 'READY') {
      historyPreview.value = { ok: false, error: '請先排除本機儲存錯誤，再預覽修正。' }
      return historyPreview.value
    }
    previewBase = game.value
    previewRequest = Object.freeze({
      ...edit, draws: Object.freeze([...edit.draws]),
      correctionId: crypto.randomUUID(), correctedAt: new Date().toISOString(),
    })
    historyPreview.value = buildHistoryPreview(game.value, previewRequest)
    return historyPreview.value
  }
  function cancelHistoryCorrection() {
    historyPreview.value = null
    previewBase = null
    previewRequest = null
  }
  function applyHistoryCorrection(): boolean {
    if (!historyPreview.value?.ok || !previewRequest) return false
    if (previewBase !== game.value) {
      historyPreview.value = { ok: false, error: '紀錄已變更，請重新預覽修正後再套用。' }
      previewBase = null
      previewRequest = null
      return false
    }
    if (!dispatch({ type: 'CORRECT_HISTORY', request: previewRequest })) return false
    cancelHistoryCorrection()
    return true
  }
  function undoDraw(): Rank | null {
    const rank = currentHand.value.at(-1)
    if (!canUndoDraw.value || !currentRound.value || !rank) return null
    return dispatch({ type: 'UNDO_DRAW', roundId: currentRound.value.id, rank }) ? rank : null
  }
  function finishRound(): boolean {
    if (!canRecord.value || !currentRound.value) return false
    return dispatch({
      type: 'FINISH_ROUND', roundId: currentRound.value.id, finishedAt: new Date().toISOString(),
    })
  }
  function startRound(): boolean {
    if (roundStatus.value !== 'FINISHED' || !currentCycle.value) return false
    const refill = remainingTotal.value < 15
    const cycleId = refill ? crypto.randomUUID() : currentCycle.value.id
    return dispatch({
      type: 'START_ROUND', roundId: crypto.randomUUID(), cycleId,
      startedAt: new Date().toISOString(),
      ...(refill ? { cycleCreated: {
        cycleId, reason: 'BELOW_15_NEXT_ROUND' as const, previousRemaining: remainingTotal.value,
      } } : {}),
    })
  }
  function confirmCycleObservation(observation: CycleObservation): boolean {
    if (!currentCycle.value) return false
    return dispatch({
      type: 'CONFIRM_CYCLE_OBSERVATION', cycleId: currentCycle.value.id, observation,
      observedAt: new Date().toISOString(),
    })
  }
  return {
    cloudWorking, cloudConflict, cloudDeletePreview, lastLocalChangeAt, conflictBackupReady,
    refreshCloudConflict, exportConflictBackup, confirmConflictBackupDownloaded, chooseCloudVersion,
    prepareCloudDelete, confirmCloudDelete,
    cloudStatus, cloudMessage, cloudUserId, cloudPreview, pendingCloudCount, lastBackupAt,
    setCloudUser, prepareCloudBackup, confirmCloudBackup, syncCloud,
    persistenceStatus, persistenceError, rawStoredData, retryPersistence,
    integrity, verifiedRemainingCount, rounds, cycles, corrections, historyPreview, currentCycle, expectedRefill, roundStatus, currentHand,
    remainingDeck, currentScore, remainingTotal, nextDraw, recommendation, canRecord, canUndoDraw,
    startRecording, recordDraw, verifyRemaining, undoDraw, finishRound, startRound, confirmCycleObservation,
    previewHistoryCorrection, applyHistoryCorrection, cancelHistoryCorrection,
    backupSummary, importPreview, exportBackup, previewImport, applyImport, cancelImport, resetDeck, clearLocalData,
  }
})
