import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgeCloudRepository } from '../../src/services/forgeCloudRepository'
import type { PendingMutationBatch } from '../../src/services/persistence'

const api = vi.hoisted(() => {
  const abortSignal = vi.fn()
  const setHeader = vi.fn(() => ({ abortSignal }))
  const eq = vi.fn(() => ({ setHeader }))
  const select = vi.fn(() => ({ eq }))
  return { getSession: vi.fn(), getUser: vi.fn(), rpc: vi.fn(() => ({ setHeader })),
    from: vi.fn(() => ({ select })), select, eq, setHeader, abortSignal }
})
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseClient: { auth: { getSession: api.getSession, getUser: api.getUser }, rpc: api.rpc, from: api.from },
}))
const uid = '11111111-1111-4111-8111-111111111111'
const batch: PendingMutationBatch = {
  mutationId: '22222222-2222-4222-8222-222222222222', expectedRevision: 0,
  resultingSession: { schemaVersion: 1, syncState: 'UNINITIALIZED', cycles: [], rounds: [] },
  actions: [{ eventId: '33333333-3333-4333-8333-333333333333', at: '2026-10-11T00:00:00.000Z', type: 'IMPORT_OVERWRITE', payload: {} }],
}
beforeEach(() => {
  vi.clearAllMocks()
  api.getSession.mockResolvedValue({ data: { session: { access_token: 'original-token' } }, error: null })
  api.getUser.mockResolvedValue({ data: { user: { id: uid } }, error: null })
  api.abortSignal.mockResolvedValue({ data: { status: 'COMMITTED', revision: 1 }, error: null })
})
describe('account-bound cloud RPC', () => {
  it('reads a legacy cloud session that carried 15 stones into the same cycle', async () => {
    const initialDeck = { A: 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4, '10': 16 }
    const draws = ['A', '2', '3', '4', '5', '6', '7', '8', '9']
      .flatMap((rank) => Array(4).fill(rank)).concat('10')
    api.abortSignal.mockReturnValueOnce({ maybeSingle: vi.fn().mockResolvedValue({ data: { revision: 2, deleted_at: null, state: {
      schemaVersion: 1, syncState: 'SYNCED', activeRoundId: 'round-2',
      cycles: [{ id: 'cycle-1', initialDeck, reason: 'USER_CONFIRMED_FULL', startedAt: '2026-10-08T09:00:00.000Z' }],
      rounds: [
        { id: 'round-1', cycleId: 'cycle-1', status: 'FINISHED', draws,
          startedAt: '2026-10-08T09:00:00.000Z', finishedAt: '2026-10-08T09:01:00.000Z' },
        { id: 'round-2', cycleId: 'cycle-1', status: 'ACTIVE', draws: [], startedAt: '2026-10-08T09:02:00.000Z' },
      ],
    } }, error: null }) })

    const remote = await forgeCloudRepository.read(uid)
    expect(remote?.state?.rounds[1]?.cycleId).toBe('cycle-1')
    expect(remote?.revision).toBe(2)
    expect(api.from).toHaveBeenCalledWith('forge_states')
  })
  it('pins the verified token even when the active SDK session changes before the RPC', async () => {
    api.getUser.mockImplementationOnce(async (token) => {
      expect(token).toBe('original-token')
      api.getSession.mockResolvedValue({ data: { session: { access_token: 'different-user-token' } }, error: null })
      return { data: { user: { id: uid } }, error: null }
    })
    expect(await forgeCloudRepository.commit(uid, batch)).toEqual({ status: 'COMMITTED', revision: 1 })
    expect(api.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer original-token')
    expect(api.rpc).toHaveBeenCalledWith('commit_forge_state', expect.objectContaining({ p_mutation_id: batch.mutationId }))
  })
  it('rejects a verified UID mismatch before issuing any write', async () => {
    api.getUser.mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null })
    await expect(forgeCloudRepository.commit(uid, batch)).rejects.toThrow('登入身分已變更')
    expect(api.rpc).not.toHaveBeenCalled()
  })
  it('rejects an invalid server acknowledgement without accepting the mutation', async () => {
    api.abortSignal.mockResolvedValueOnce({ data: { status: 'COMMITTED', revision: '1' }, error: null })
    await expect(forgeCloudRepository.commit(uid, batch)).rejects.toThrow('雲端回應格式不合法')
  })
  it('pins the deletion token and rejects a revision outside the confirmed deletion target', async () => {
    api.abortSignal.mockResolvedValueOnce({ data: { status: 'DELETED', revision: 2 }, error: null })
    expect(await forgeCloudRepository.delete(uid, 1)).toEqual({ status: 'DELETED', revision: 2 })
    expect(api.rpc).toHaveBeenCalledWith('delete_forge_data', { p_expected_revision: 1 })
    expect(api.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer original-token')
    api.abortSignal.mockResolvedValueOnce({ data: { status: 'DELETED', revision: 8 }, error: null })
    await expect(forgeCloudRepository.delete(uid, 1)).rejects.toThrow('刪除回應不合法')
  })
})
