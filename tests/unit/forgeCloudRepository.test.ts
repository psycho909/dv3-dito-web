import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgeCloudRepository } from '../../src/services/forgeCloudRepository'
import type { PendingMutationBatch } from '../../src/services/persistence'

const api = vi.hoisted(() => {
  const abortSignal = vi.fn()
  const setHeader = vi.fn(() => ({ abortSignal }))
  return { getSession: vi.fn(), getUser: vi.fn(), rpc: vi.fn(() => ({ setHeader })), setHeader, abortSignal }
})
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseClient: { auth: { getSession: api.getSession, getUser: api.getUser }, rpc: api.rpc },
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
