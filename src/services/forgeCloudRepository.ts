import { supabaseClient } from './supabaseClient'
import { parsePersistedSession, type PendingMutationBatch } from './persistence'
import type { GameState } from '../domain/gameReducer'

export interface CloudState { revision: number; state: GameState | null; deletedAt: string | null }
export interface CommitResult { status: 'COMMITTED' | 'VERSION_CONFLICT' | 'DATA_DELETED'; revision: number }

async function checkedClient(userId: string) {
  if (!supabaseClient) throw new Error('GitHub 登入未設定；紀錄仍保存在本機。')
  const session = await supabaseClient.auth.getSession()
  const token = session.data.session?.access_token
  if (session.error || !token) throw new Error('請登入原 GitHub 帳號後重試。')
  const { data, error } = await supabaseClient.auth.getUser(token)
  if (error || data.user?.id !== userId) throw new Error('登入身分已變更，已停止上傳原帳號紀錄。')
  return { client: supabaseClient, token }
}

export const forgeCloudRepository = {
  async read(userId: string): Promise<CloudState | null> {
    const { client, token } = await checkedClient(userId)
    const { data, error } = await client.from('forge_states').select('revision,state,deleted_at')
      .eq('user_id', userId).setHeader('Authorization', `Bearer ${token}`)
      .abortSignal(globalThis.AbortSignal.timeout(15000)).maybeSingle()
    if (error) throw new Error('無法讀取雲端紀錄，請確認連線後重試。')
    if (!data) return null
    if (!Number.isSafeInteger(data.revision) || data.revision < 0
      || (data.deleted_at !== null && typeof data.deleted_at !== 'string')) throw new Error('雲端版本格式不合法。')
    if (data.deleted_at !== null) return { revision: data.revision, state: null, deletedAt: data.deleted_at }
    const parsed = parsePersistedSession(JSON.stringify(data.state))
    if (!parsed.ok) throw new Error('雲端紀錄驗證失敗；本機紀錄未被覆蓋。')
    return { revision: data.revision, state: parsed.state, deletedAt: null }
  },
  async commit(userId: string, batch: PendingMutationBatch): Promise<CommitResult> {
    const { client, token } = await checkedClient(userId)
    if (new TextEncoder().encode(JSON.stringify(batch.resultingSession)).length > 524288
      || new TextEncoder().encode(JSON.stringify(batch.actions)).length > 524288) {
      throw new Error('紀錄超過雲端大小上限，請先匯出 JSON；本機與待送資料仍保留。')
    }
    const { data, error } = await client.rpc('commit_forge_state', {
      p_expected_revision: batch.expectedRevision, p_mutation_id: batch.mutationId,
      p_state: batch.resultingSession, p_actions: batch.actions,
    }).setHeader('Authorization', `Bearer ${token}`).abortSignal(globalThis.AbortSignal.timeout(15000))
    if (error) throw new Error('雲端上傳未確認；紀錄與待送批次仍保留，請重試或匯出 JSON。')
    if (!data || !['COMMITTED', 'VERSION_CONFLICT', 'DATA_DELETED'].includes(data.status)
      || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('雲端回應格式不合法，待送資料仍保留。')
    return data as CommitResult
  },
}
