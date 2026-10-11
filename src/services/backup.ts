import { deriveCycleDeck, type GameState, type SyncState } from '../domain/gameReducer'
import { RANKS, type Rank } from '../domain'
import { parsePersistedSession, serializePersistedSession } from './persistence'

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024

export interface BackupSummary {
  roundCount: number
  cycleCount: number
  drawCount: number
  currentHand: readonly Rank[]
  remainingTotal: number
  syncState: SyncState
}

export type ImportPreview =
  | { ok: true; current: BackupSummary; incoming: BackupSummary; fileName: string }
  | { ok: false; error: string }

export function serializeGameBackup(state: GameState): string {
  return serializePersistedSession(state)
}

export function parseGameBackup(raw: string): { ok: true; state: GameState } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: '備份檔內容必須是文字。' }

  let byteLength: number
  try {
    byteLength = new TextEncoder().encode(raw).byteLength
  } catch {
    return { ok: false, error: '無法計算備份檔大小。' }
  }
  if (byteLength > MAX_BACKUP_BYTES) return { ok: false, error: '備份檔超過 5 MiB 上限。' }

  return parsePersistedSession(raw)
}

export function summarizeGameState(state: GameState): BackupSummary {
  const currentRound = state.rounds.at(-1)
  const deck = state.cycles.length === 0 ? undefined : deriveCycleDeck(state)
  const remainingTotal = deck === undefined
    ? 0 : RANKS.reduce((sum, rank) => sum + deck[rank], 0)
  return Object.freeze({
    roundCount: state.rounds.length,
    cycleCount: state.cycles.length,
    drawCount: state.rounds.reduce((count, round) => count + round.draws.length, 0),
    currentHand: Object.freeze([...(currentRound?.draws ?? [])]),
    remainingTotal,
    syncState: state.syncState,
  })
}
