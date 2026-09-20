/**
 * Top-level keys `formatHtmlReport` reads (canonical names + aliases).
 * Nested fields are documented in docs/report-json.md.
 */
export const HTML_REPORT_TOP_LEVEL_KEYS = [
  'example',
  'score',
  'profile',
  'mode',
  'qualityMode',
  'incomplete',
  'staticScan',
  'repository',
  'baseline',
  'after',
  'findings',
  'expensiveMeshes',
  'topMeshes',
  'triangleContributorSummary',
  'gpuPassTimes',
  'passGpuMs',
  'captures',
  'visuals',
  'screenshots',
  'history',
  'noiseBand',
  'claimed',
  'expectedTradeoffs',
] as const

/**
 * Keys that may appear on a real Doctor / Quality Ladder JSON without being a typo.
 * The report command warns only for names outside this set.
 */
export const KNOWN_REPORT_TOP_LEVEL_KEYS = new Set<string>([
  ...HTML_REPORT_TOP_LEVEL_KEYS,
  'deltas',
  'appliedPasses',
  'failedPasses',
  'invalid',
  'invalidReason',
  'visualDelta',
  'gpuTimingSkipped',
  'rolledBackDueToVisual',
  'phase',
  'tier',
  'startTier',
  'maxTier',
  'appliedKnobs',
  'unsupportedKnobs',
  'floorFailed',
  'applyFailed',
  'ttfiMs',
  'adapterUnavailable',
  'recommendedTier',
  '$schema',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function collectUnrecognisedTopLevelKeys(report: unknown): string[] {
  if (!isRecord(report)) return []
  return Object.keys(report)
    .filter((key) => !KNOWN_REPORT_TOP_LEVEL_KEYS.has(key))
    .sort()
}

export function formatUnrecognisedKeysWarning(keys: string[]): string {
  return (
    `warning: unrecognised top-level key(s) in report JSON: ${keys.join(', ')} ` +
    '(see docs/report-json.md). The HTML formatter ignores unknown names — check for typos.'
  )
}
