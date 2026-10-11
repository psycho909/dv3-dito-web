import { INITIAL_DECK, RANKS, validateDeck, type Deck, type Rank } from './index'
import type { GameState, SyncState } from './gameReducer'

export interface HistoryEdit {
  roundId: string
  draws: readonly Rank[]
  reason: string
}

export interface HistoryCorrectionRequest extends HistoryEdit {
  correctionId: string
  correctedAt: string
}

export interface RoundImpact {
  roundId: string
  beforeStart: number
  beforeEnd: number
  afterStart: number
  afterEnd: number
  beforeCycleId: string
  afterCycleId: string
}

export interface BoundaryChange {
  kind: 'ADDED' | 'REMOVED' | 'MOVED'
  cycleId: string
  fromRoundId?: string
  toRoundId?: string
  previousRemaining: number
}

export interface BoundaryWarning {
  cycleId: string
  roundId: string
  previousRemaining: number
  message: string
}

export interface HistoryCorrection {
  id: string
  correctedAt: string
  roundId: string
  beforeDraws: readonly Rank[]
  afterDraws: readonly Rank[]
  reason: string
  boundaryChanges: readonly BoundaryChange[]
  warnings: readonly BoundaryWarning[]
}

export type HistoryPreview = {
  ok: true
  nextState: GameState
  affectedRounds: readonly RoundImpact[]
  boundaryChanges: readonly BoundaryChange[]
  warnings: readonly BoundaryWarning[]
  remainingDeck: Deck
  remainingTotal: number
  syncState: SyncState
} | {
  ok: false
  error: string
  conflictRoundId?: string
}

export function previewHistoryCorrection(
  state: GameState,
  request: HistoryCorrectionRequest,
): HistoryPreview {
  const requestedRoundId = request && typeof request.roundId === 'string' ? request.roundId : undefined
  const fail = (error: string, conflictRoundId = requestedRoundId): HistoryPreview => ({
    ok: false, error, conflictRoundId,
  })
  if (!request || typeof request !== 'object') return fail('修正資料格式不合法')
  if (typeof request.correctionId !== 'string' || request.correctionId.trim() === ''
    || request.correctionId.trim() !== request.correctionId) {
    return fail('修正 ID 不可為空')
  }
  if (!isCanonicalIsoTimestamp(request.correctedAt)) return fail('修正時間必須是標準 ISO 時間')
  if (typeof request.reason !== 'string' || request.reason.trim().length < 1 || request.reason.length > 500) {
    return fail('修正理由長度必須為 1 到 500 字')
  }
  if (!state || !Array.isArray(state.rounds) || !Array.isArray(state.cycles)) {
    return fail('遊戲歷史格式不合法')
  }
  if (state.corrections !== undefined && !Array.isArray(state.corrections)) {
    return fail('修正稽核資料格式不合法')
  }
  const shapeError = validateHistoryShape(state)
  if (shapeError) return fail(shapeError.message, shapeError.roundId)
  const reservedIds = new Set([
    ...state.cycles.map((cycle) => cycle.id),
    ...state.rounds.map((round) => round.id),
    ...(state.corrections ?? []).map((correction) => correction.id),
  ])
  if (reservedIds.has(request.correctionId)) {
    return fail(`修正 ID ${request.correctionId} 已使用`)
  }
  reservedIds.add(request.correctionId)

  const roundIndex = state.rounds.findIndex((round) => round.id === request.roundId)
  if (roundIndex < 0) return fail(`找不到回合 ${request.roundId}`)
  if (!Array.isArray(request.draws) || !request.draws.every(isRank)) {
    return fail('修正牌點包含不合法的 rank', request.roundId)
  }
  const target = state.rounds[roundIndex]
  if (sameRanks(target.draws, request.draws)) return fail('修正後牌點必須與原紀錄不同')

  const cycleById = new Map(state.cycles.map((cycle) => [cycle.id, cycle]))
  const beforeReplay = replayRecordedRounds(state.rounds, cycleById)
  if (!beforeReplay.ok) return fail(beforeReplay.error, beforeReplay.conflictRoundId)
  const cycleMetricError = validateCycleMetrics(state, beforeReplay.firstRoundByCycle,
    beforeReplay.previousRemainingByRound)
  if (cycleMetricError) return fail(cycleMetricError.message, cycleMetricError.roundId)

  const rounds = state.rounds.map((round, index) => index === roundIndex
    ? { ...round, draws: [...request.draws] } : round)
  const fixedStarts = new Map<number, typeof state.cycles[number]>()
  const inferredCycles: Array<{ cycle: typeof state.cycles[number]; roundIndex: number; previousRemaining: number }> = []
  for (const cycle of state.cycles) {
    const index = beforeReplay.firstRoundByCycle.get(cycle.id)
    if (index === undefined) return fail(`週期 ${cycle.id} 沒有引用回合`)
    if (isFixedCycle(cycle)) fixedStarts.set(index, cycle)
    else inferredCycles.push({
      cycle, roundIndex: index,
      previousRemaining: cycle.previousRemaining ?? beforeReplay.previousRemainingByRound.get(index) ?? 0,
    })
  }

  const firstCycle = fixedStarts.get(0)
  if (!firstCycle) return fail('第一個週期必須是固定起始週期', state.rounds[0]?.id)
  const plans: InferredReplayPlan[] = []
  const planByRound: ReplayPlan[] = []
  const warnings: BoundaryWarning[] = []
  const impactsAfter: Array<{ start: number; end: number; plan: ReplayPlan }> = []
  let deck: Record<Rank, number> | undefined
  let previousRemaining: number | undefined
  let currentPlan: ReplayPlan | undefined

  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index]
    const fixed = fixedStarts.get(index)
    let nextPlan = currentPlan
    if (index === 0) {
      nextPlan = { kind: 'FIXED', cycle: firstCycle, roundIndex: index }
    } else if (fixed) {
      nextPlan = { kind: 'FIXED', cycle: fixed, roundIndex: index, previousRemaining: previousRemaining ?? 0 }
      if ((previousRemaining ?? 0) >= 15) {
        warnings.push({
          cycleId: fixed.id,
          roundId: round.id,
          previousRemaining: previousRemaining ?? 0,
          message: `此處保留固定的 52 顆週期邊界，但修正後上一局剩 ${previousRemaining ?? 0} 顆，與少於 15 顆的規則不符。`,
        })
      }
    } else if ((previousRemaining ?? 52) < 15) {
      nextPlan = {
        kind: 'INFERRED', roundIndex: index, previousRemaining: previousRemaining ?? 0,
      }
      plans.push(nextPlan)
    }

    if (!nextPlan) return fail('無法建立目前週期', round.id)
    if (nextPlan !== currentPlan) {
      deck = nextPlan.kind === 'FIXED'
        ? { ...nextPlan.cycle.initialDeck }
        : { ...INITIAL_DECK }
      currentPlan = nextPlan
    }
    if (!deck || !currentPlan) return fail('無法建立週期牌池', round.id)
    const activePlan = currentPlan
    planByRound.push(activePlan)
    const start = total(deck)
    for (const rank of round.draws) {
      if (!isRank(rank)) return fail(`回合 ${round.id} 含不合法的 rank`, round.id)
      if (deck[rank] <= 0) return fail(`回合 ${round.id} 超抽 ${rank}`, round.id)
      deck[rank] -= 1
    }
    const end = total(deck)
    impactsAfter.push({ start, end, plan: activePlan })
    previousRemaining = end
  }

  const boundaryResult = assignInferredCycleIds(
    request.correctionId, reservedIds, inferredCycles, plans, fixedStarts,
    state.rounds, rounds,
  )
  if (!boundaryResult.ok) return fail(boundaryResult.error, boundaryResult.conflictRoundId)
  const { boundaryChanges } = boundaryResult

  const afterCycles: typeof state.cycles[number][] = []
  const seenCycleIds = new Set<string>()
  for (const plan of plansAtStarts(planByRound)) {
    const round = rounds[plan.roundIndex]
    const cycle: typeof state.cycles[number] = plan.kind === 'FIXED'
      ? {
        ...plan.cycle,
        ...(plan.roundIndex > 0
          ? { previousRemaining: plan.previousRemaining } : {}),
      }
      : {
        id: plan.id!, initialDeck: INITIAL_DECK, startedAt: round.startedAt,
        reason: 'BELOW_15_NEXT_ROUND', triggeredByRoundId: round.id,
        previousRemaining: plan.previousRemaining,
      }
    if (seenCycleIds.has(cycle.id)) return fail(`週期 ID ${cycle.id} 重複`, round.id)
    seenCycleIds.add(cycle.id)
    afterCycles.push(cycle)
  }

  const newRounds = rounds.map((round, index) => ({
    ...round, cycleId: planByRound[index].kind === 'FIXED'
      ? planByRound[index].cycle.id : planByRound[index].id!,
  }))
  const afterCycleById = new Map(afterCycles.map((cycle) => [cycle.id, cycle]))
  const affectedRounds: RoundImpact[] = []
  for (let index = 0; index < rounds.length; index += 1) {
    const before = beforeReplay.impacts[index]
    const after = impactsAfter[index]
    const beforeCycleId = state.rounds[index].cycleId
    const afterCycleId = newRounds[index].cycleId
    if (index === roundIndex || before.start !== after.start || before.end !== after.end
      || beforeCycleId !== afterCycleId) {
      affectedRounds.push({
        roundId: rounds[index].id,
        beforeStart: before.start,
        beforeEnd: before.end,
        afterStart: after.start,
        afterEnd: after.end,
        beforeCycleId,
        afterCycleId,
      })
    }
  }

  const previousCurrent = cycleForRound(state.rounds.at(-1)!, cycleById)
  const nextCurrent = afterCycleById.get(newRounds.at(-1)!.cycleId)
  if (!nextCurrent) return fail('修正後目前週期遺失', newRounds.at(-1)!.id)
  const currentCycleChanged = cycleAnchor(previousCurrent, state.rounds)
    !== cycleAnchor(nextCurrent, newRounds)
  const keepVerificationTarget = state.verifiedRemainingCount !== undefined
    && !currentCycleChanged
  if (!deck) return fail('無法計算修正後牌池')
  const syncState = keepVerificationTarget && state.verifiedRemainingCount !== total(deck)
    ? 'UNSYNCED' : nextSyncState(state, nextCurrent)
  const correction: HistoryCorrection = {
    id: request.correctionId,
    correctedAt: request.correctedAt,
    roundId: request.roundId,
    beforeDraws: [...target.draws],
    afterDraws: [...request.draws],
    reason: request.reason,
    boundaryChanges,
    warnings,
  }
  const base = keepVerificationTarget ? state : withoutVerifiedRemainingCount(state)
  const nextState = immutableState({
    ...base,
    rounds: newRounds,
    cycles: afterCycles,
    syncState,
    ...(keepVerificationTarget ? { verifiedRemainingCount: state.verifiedRemainingCount } : {}),
    corrections: [...(state.corrections ?? []), correction],
  })
  const remainingDeck = Object.freeze({ ...deck })
  return {
    ok: true,
    nextState,
    affectedRounds,
    boundaryChanges,
    warnings,
    remainingDeck,
    remainingTotal: total(deck),
    syncState,
  }
}

interface FixedReplayPlan {
  kind: 'FIXED'
  cycle: GameState['cycles'][number]
  roundIndex: number
  previousRemaining?: number
}

interface InferredReplayPlan {
  kind: 'INFERRED'
  roundIndex: number
  previousRemaining: number
  id?: string
}

type ReplayPlan = FixedReplayPlan | InferredReplayPlan

interface ReplayImpact { start: number; end: number }

function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && RANKS.includes(value as Rank)
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const timestamp = new Date(value)
  return !Number.isNaN(timestamp.valueOf()) && timestamp.toISOString() === value
}

function sameRanks(left: readonly Rank[], right: readonly Rank[]): boolean {
  return left.length === right.length && left.every((rank, index) => rank === right[index])
}

function isFixedCycle(cycle: GameState['cycles'][number]): boolean {
  return cycle.reason !== 'BELOW_15_NEXT_ROUND' || cycle.observation !== undefined
}

function total(deck: Readonly<Record<Rank, number>>): number {
  return RANKS.reduce((sum, rank) => sum + deck[rank], 0)
}

function validateHistoryShape(state: GameState): { message: string; roundId?: string } | undefined {
  const cycleIds = new Set<string>()
  for (const cycle of state.cycles) {
    if (!cycle || typeof cycle.id !== 'string' || cycle.id === '' || cycleIds.has(cycle.id)) {
      return { message: '週期 ID 缺失或重複' }
    }
    cycleIds.add(cycle.id)
    if (!validateDeck(cycle.initialDeck) || RANKS.some((rank) => cycle.initialDeck[rank] !== INITIAL_DECK[rank])) {
      return { message: `週期 ${cycle.id} 的牌池格式不合法` }
    }
    if (!['USER_CONFIRMED_FULL', 'MANUAL_RESET', 'BELOW_15_NEXT_ROUND'].includes(cycle.reason)) {
      return { message: `週期 ${cycle.id} 的原因不合法` }
    }
    if (cycle.observation !== undefined && !['CONFIRMED_52', 'DENIED'].includes(cycle.observation)) {
      return { message: `週期 ${cycle.id} 的觀察狀態不合法` }
    }
  }

  const roundIds = new Set<string>()
  const seenCycles = new Set<string>()
  const firstRoundByCycle = new Map<string, GameState['rounds'][number]>()
  let previousCycleId: string | undefined
  for (const round of state.rounds) {
    if (!round || typeof round.id !== 'string' || round.id === '' || roundIds.has(round.id)) {
      return { message: '回合 ID 缺失或重複', roundId: round?.id }
    }
    roundIds.add(round.id)
    if (!cycleIds.has(round.cycleId)) return { message: `回合引用不存在的週期 ${round.cycleId}`, roundId: round.id }
    if (round.cycleId !== previousCycleId) {
      if (seenCycles.has(round.cycleId)) return { message: `週期 ${round.cycleId} 的回合不連續`, roundId: round.id }
      seenCycles.add(round.cycleId)
      firstRoundByCycle.set(round.cycleId, round)
      previousCycleId = round.cycleId
    }
    if (!Array.isArray(round.draws) || !round.draws.every(isRank)) {
      return { message: '回合牌點格式不合法', roundId: round.id }
    }
    if (!['ACTIVE', 'FINISHED'].includes(round.status) || typeof round.startedAt !== 'string') {
      return { message: '回合資料格式不合法', roundId: round.id }
    }
  }
  if (seenCycles.size !== state.cycles.length
    || state.cycles.some((cycle, index) => [...seenCycles][index] !== cycle.id)) {
    return { message: '週期順序與回合引用不一致', roundId: state.rounds[0]?.id }
  }
  if (state.cycles.length > 0) {
    const initial = state.cycles[0]
    const initialRound = firstRoundByCycle.get(initial.id)
    if (initial.reason !== 'USER_CONFIRMED_FULL' || initial.observation !== undefined
      || initial.triggeredByRoundId !== undefined || initial.previousRemaining !== undefined
      || initial.startedAt !== initialRound?.startedAt) {
      return { message: '第一個週期必須是沒有觸發回合的 USER_CONFIRMED_FULL', roundId: initialRound?.id }
    }
    for (const cycle of state.cycles.slice(1)) {
      const round = firstRoundByCycle.get(cycle.id)
      if (!round || cycle.triggeredByRoundId !== round.id || cycle.startedAt !== round.startedAt
        || !Number.isInteger(cycle.previousRemaining)
        || cycle.previousRemaining! < 0 || cycle.previousRemaining! > 52) {
        return { message: `週期 ${cycle.id} 的觸發回合或 previousRemaining 不合法`, roundId: round?.id }
      }
      if ((cycle.reason === 'USER_CONFIRMED_FULL' || cycle.reason === 'MANUAL_RESET')
        && cycle.observation !== undefined) {
        return { message: `週期 ${cycle.id} 不應另帶補滿觀察`, roundId: round.id }
      }
    }
  }
  if (state.activeRoundId !== undefined
    && !state.rounds.some((round) => round.id === state.activeRoundId && round.status === 'ACTIVE')) {
    return { message: '目前回合引用不合法', roundId: state.activeRoundId }
  }
  const correctionIds = new Set<string>()
  for (const correction of state.corrections ?? []) {
    if (!correction || typeof correction.id !== 'string' || correction.id.trim() === ''
      || correctionIds.has(correction.id) || !isCanonicalIsoTimestamp(correction.correctedAt)
      || typeof correction.roundId !== 'string' || !roundIds.has(correction.roundId)
      || typeof correction.reason !== 'string' || correction.reason.trim() === '' || correction.reason.length > 500
      || !Array.isArray(correction.beforeDraws) || !correction.beforeDraws.every(isRank)
      || !Array.isArray(correction.afterDraws) || !correction.afterDraws.every(isRank)
      || sameRanks(correction.beforeDraws, correction.afterDraws)
      || !Array.isArray(correction.boundaryChanges) || !Array.isArray(correction.warnings)) {
      return { message: '歷史修正 audit 格式不合法', roundId: correction?.roundId }
    }
    correctionIds.add(correction.id)
    for (const change of correction.boundaryChanges) {
      if (!change || typeof change.cycleId !== 'string' || change.cycleId === ''
        || !Number.isInteger(change.previousRemaining) || change.previousRemaining < 0 || change.previousRemaining > 52
        || (change.kind === 'ADDED'
          ? change.fromRoundId !== undefined || typeof change.toRoundId !== 'string' || change.toRoundId === ''
          : change.kind === 'REMOVED'
            ? typeof change.fromRoundId !== 'string' || change.fromRoundId === '' || change.toRoundId !== undefined
            : change.kind === 'MOVED'
              ? typeof change.fromRoundId !== 'string' || change.fromRoundId === ''
                || typeof change.toRoundId !== 'string' || change.toRoundId === ''
                || change.fromRoundId === change.toRoundId
              : true)) {
        return { message: '歷史修正邊界 audit 格式不合法', roundId: correction.roundId }
      }
    }
    for (const warning of correction.warnings) {
      if (!warning || typeof warning.cycleId !== 'string' || warning.cycleId === ''
        || typeof warning.roundId !== 'string' || warning.roundId === ''
        || !Number.isInteger(warning.previousRemaining) || warning.previousRemaining < 0
        || warning.previousRemaining > 52 || typeof warning.message !== 'string' || warning.message.trim() === '') {
        return { message: '歷史修正 warning audit 格式不合法', roundId: correction.roundId }
      }
    }
  }
  return undefined
}

function validateCycleMetrics(
  state: GameState,
  firstRoundByCycle: ReadonlyMap<string, number>,
  previousRemainingByRound: ReadonlyMap<number, number>,
): { message: string; roundId?: string } | undefined {
  for (let index = 1; index < state.cycles.length; index += 1) {
    const cycle = state.cycles[index]
    const roundIndex = firstRoundByCycle.get(cycle.id)
    const round = roundIndex === undefined ? undefined : state.rounds[roundIndex]
    const actualPreviousRemaining = roundIndex === undefined
      ? undefined : previousRemainingByRound.get(roundIndex)
    if (actualPreviousRemaining === undefined || cycle.previousRemaining !== actualPreviousRemaining) {
      return { message: `週期 ${cycle.id} 的 previousRemaining 與觸發回合不一致`, roundId: round?.id }
    }
    if (cycle.reason === 'BELOW_15_NEXT_ROUND' && cycle.observation === undefined
      && actualPreviousRemaining >= 15) {
      return { message: `未觀察推定週期 ${cycle.id} 必須從剩餘少於 15 顆處開始`, roundId: round?.id }
    }
    if (cycle.reason === 'BELOW_15_NEXT_ROUND' && cycle.observation !== undefined
      && actualPreviousRemaining >= 15
      && !hasWarning(state, cycle.id, round?.id ?? '', actualPreviousRemaining)) {
      return { message: `已觀察的低於 15 週期 ${cycle.id} 缺少對應規則 warning`, roundId: round?.id }
    }
  }
  return undefined
}

function hasWarning(state: GameState, cycleId: string, roundId: string, previousRemaining: number): boolean {
  return state.corrections?.some((correction) => correction.warnings.some((warning) =>
    warning.cycleId === cycleId && warning.roundId === roundId
      && warning.previousRemaining === previousRemaining)) ?? false
}

function replayRecordedRounds(
  rounds: GameState['rounds'],
  cycles: ReadonlyMap<string, GameState['cycles'][number]>,
): { ok: true; impacts: ReplayImpact[]; firstRoundByCycle: Map<string, number>; previousRemainingByRound: Map<number, number> }
  | { ok: false; error: string; conflictRoundId: string } {
  const impacts: ReplayImpact[] = []
  const firstRoundByCycle = new Map<string, number>()
  const previousRemainingByRound = new Map<number, number>()
  let activeCycleId: string | undefined
  let deck: Record<Rank, number> | undefined
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index]
    const cycle = cycles.get(round.cycleId)
    if (!cycle) return { ok: false, error: `回合引用不存在的週期 ${round.cycleId}`, conflictRoundId: round.id }
    if (round.cycleId !== activeCycleId) {
      if (index > 0) previousRemainingByRound.set(index, total(deck!))
      activeCycleId = round.cycleId
      deck = { ...cycle.initialDeck }
      firstRoundByCycle.set(cycle.id, index)
    }
    const start = total(deck!)
    for (const rank of round.draws) {
      if (!isRank(rank)) return { ok: false, error: `回合 ${round.id} 含不合法的 rank`, conflictRoundId: round.id }
      if (deck![rank] <= 0) return { ok: false, error: `回合 ${round.id} 超抽 ${rank}`, conflictRoundId: round.id }
      deck![rank] -= 1
    }
    impacts.push({ start, end: total(deck!) })
  }
  return { ok: true, impacts, firstRoundByCycle, previousRemainingByRound }
}

function assignInferredCycleIds(
  correctionId: string,
  existingIds: ReadonlySet<string>,
  oldBoundaries: Array<{ cycle: GameState['cycles'][number]; roundIndex: number; previousRemaining: number }>,
  newBoundaries: InferredReplayPlan[],
  fixedStarts: ReadonlyMap<number, GameState['cycles'][number]>,
  oldRounds: GameState['rounds'],
  newRounds: GameState['rounds'],
): { ok: true; boundaryChanges: BoundaryChange[] }
  | { ok: false; error: string; conflictRoundId: string } {
  const matchedOld = new Set<number>()
  const matchedNew = new Set<number>()
  const movedChanges: BoundaryChange[] = []
  const fixedPositions = [...fixedStarts.keys()].sort((a, b) => a - b)
  const segment = (index: number) => fixedPositions.filter((position) => position < index).length
  const segments = new Set([...oldBoundaries.map((item) => segment(item.roundIndex)),
    ...newBoundaries.map((item) => segment(item.roundIndex))])
  for (const segmentId of segments) {
    const old = oldBoundaries.filter((item) => segment(item.roundIndex) === segmentId)
    const added = newBoundaries.filter((item) => segment(item.roundIndex) === segmentId)
    for (let oldIndex = 0; oldIndex < old.length; oldIndex += 1) {
      const matchIndex = added.findIndex((item) => !matchedNew.has(newBoundaries.indexOf(item))
        && item.roundIndex === old[oldIndex].roundIndex)
      if (matchIndex < 0) continue
      const globalOld = oldBoundaries.indexOf(old[oldIndex])
      const globalNew = newBoundaries.indexOf(added[matchIndex])
      added[matchIndex].id = old[oldIndex].cycle.id
      matchedOld.add(globalOld)
      matchedNew.add(globalNew)
    }
    const unmatchedOld = old.filter((item) => !matchedOld.has(oldBoundaries.indexOf(item)))
    const unmatchedNew = added.filter((item) => !matchedNew.has(newBoundaries.indexOf(item)))
    const movedCount = Math.min(unmatchedOld.length, unmatchedNew.length)
    for (let index = 0; index < movedCount; index += 1) {
      const oldBoundary = unmatchedOld[index]
      const newBoundary = unmatchedNew[index]
      newBoundary.id = oldBoundary.cycle.id
      matchedOld.add(oldBoundaries.indexOf(oldBoundary))
      matchedNew.add(newBoundaries.indexOf(newBoundary))
      movedChanges.push({
        kind: 'MOVED', cycleId: oldBoundary.cycle.id,
        fromRoundId: oldRounds[oldBoundary.roundIndex].id,
        toRoundId: newRounds[newBoundary.roundIndex].id,
        previousRemaining: newBoundary.previousRemaining ?? 0,
      })
    }
  }

  const removed: BoundaryChange[] = []
  for (let index = 0; index < oldBoundaries.length; index += 1) {
    if (matchedOld.has(index)) continue
    const boundary = oldBoundaries[index]
    removed.push({
      kind: 'REMOVED', cycleId: boundary.cycle.id,
      fromRoundId: oldRounds[boundary.roundIndex].id,
      previousRemaining: boundary.previousRemaining,
    })
  }

  const addedChanges: BoundaryChange[] = []
  const reservedIds = new Set(existingIds)
  for (let index = 0; index < newBoundaries.length; index += 1) {
    const boundary = newBoundaries[index]
    if (matchedNew.has(index)) continue
    boundary.id = `history-correction:${encodeURIComponent(correctionId)}:cycle:${encodeURIComponent(newRounds[boundary.roundIndex].id)}`
    if (reservedIds.has(boundary.id)) {
      return { ok: false, error: `推定週期 ID ${boundary.id} 已存在`, conflictRoundId: newRounds[boundary.roundIndex].id }
    }
    reservedIds.add(boundary.id)
    addedChanges.push({
      kind: 'ADDED', cycleId: boundary.id,
      toRoundId: newRounds[boundary.roundIndex].id,
      previousRemaining: boundary.previousRemaining ?? 0,
    })
  }
  const roundOrder = new Map(newRounds.map((round, index) => [round.id, index]))
  const boundaryChanges = [...removed, ...movedChanges, ...addedChanges].sort((left, right) =>
    Math.min(roundOrder.get(left.fromRoundId ?? left.toRoundId ?? '') ?? 0,
      roundOrder.get(left.toRoundId ?? left.fromRoundId ?? '') ?? 0)
    - Math.min(roundOrder.get(right.fromRoundId ?? right.toRoundId ?? '') ?? 0,
      roundOrder.get(right.toRoundId ?? right.fromRoundId ?? '') ?? 0))
  return { ok: true, boundaryChanges }
}

function plansAtStarts(plans: readonly ReplayPlan[]): ReplayPlan[] {
  return plans.filter((plan, index) => index === 0 || plan !== plans[index - 1])
}

function cycleForRound(
  round: GameState['rounds'][number],
  cycles: ReadonlyMap<string, GameState['cycles'][number]>,
): GameState['cycles'][number] {
  return cycles.get(round.cycleId)!
}

function cycleAnchor(cycle: GameState['cycles'][number], rounds: GameState['rounds']): string {
  return `${cycle.id}\u0000${cycle.triggeredByRoundId ?? rounds.find((round) => round.cycleId === cycle.id)?.id ?? ''}`
}

function nextSyncState(
  state: GameState,
  currentCycle: GameState['cycles'][number],
): SyncState {
  if (state.syncState === 'UNSYNCED') return 'UNSYNCED'
  if (currentCycle.observation === 'DENIED') return 'UNSYNCED'
  if (state.syncState === 'SYNCED') return 'SYNCED'
  return state.syncState
}

function withoutVerifiedRemainingCount(state: GameState): GameState {
  const copy = { ...state }
  Reflect.deleteProperty(copy, 'verifiedRemainingCount')
  return copy
}

function immutableState(state: GameState): GameState {
  const rounds = Object.freeze(state.rounds.map((round) => Object.freeze({
    ...round, draws: Object.freeze([...round.draws]),
  })))
  const cycles = Object.freeze(state.cycles.map((cycle) => Object.freeze({
    ...cycle, initialDeck: Object.freeze({ ...cycle.initialDeck }),
  })))
  const corrections = state.corrections === undefined ? undefined : Object.freeze(state.corrections.map((correction) =>
    Object.freeze({
      ...correction,
      beforeDraws: Object.freeze([...correction.beforeDraws]),
      afterDraws: Object.freeze([...correction.afterDraws]),
      boundaryChanges: Object.freeze(correction.boundaryChanges.map((change) => Object.freeze({ ...change }))),
      warnings: Object.freeze(correction.warnings.map((warning) => Object.freeze({ ...warning }))),
    })))
  return Object.freeze({
    ...state,
    rounds,
    cycles,
    ...(corrections === undefined ? {} : { corrections }),
  })
}
