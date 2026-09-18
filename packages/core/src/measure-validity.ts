export interface MeasureValidityInput {
  visibilityState?: string
  frameTimesMs: number[]
  /** Gaps at or above this many ms count as throttled rAF. Default 250. */
  throttleMs?: number
}

export interface MeasureValidity {
  invalid: boolean
  reason?: string
}

/** Hidden tabs and background-throttled rAF must not produce a trusted score. */
export function classifyMeasureValidity(input: MeasureValidityInput): MeasureValidity {
  if (input.visibilityState === 'hidden') {
    return { invalid: true, reason: 'hidden' }
  }
  const throttleMs = input.throttleMs ?? 250
  const throttled = input.frameTimesMs.filter((ms) => ms >= throttleMs)
  if (throttled.some((ms) => ms >= 1000) || throttled.length >= 2) {
    return { invalid: true, reason: 'throttled-raf' }
  }
  return { invalid: false }
}
