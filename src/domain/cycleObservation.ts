export type CycleObservation = 'CONFIRMED_52' | 'DENIED'
export type CycleReason = 'USER_CONFIRMED_FULL' | 'MANUAL_RESET' | 'BELOW_15_NEXT_ROUND'

export interface ObservationCycle {
  readonly reason: CycleReason
  readonly observation?: CycleObservation
}

/** Observations carry across refill cycles until a new observation or a fixed-deck cycle resets them. */
export function effectiveObservation(cycles: readonly ObservationCycle[]): CycleObservation | undefined {
  let latestObservation: CycleObservation | undefined
  for (const cycle of cycles) {
    if (cycle.reason !== 'BELOW_15_NEXT_ROUND') latestObservation = undefined
    else if (cycle.observation !== undefined) latestObservation = cycle.observation
  }
  return latestObservation
}
