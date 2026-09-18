export function pixelChangedRatio(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  channelThreshold = 8,
): number {
  const len = Math.min(a.length, b.length)
  if (len < 4) return a.length === b.length ? 0 : 1
  const pixels = Math.floor(len / 4)
  let changed = 0
  for (let i = 0; i < pixels; i++) {
    const o = i * 4
    const dr = Math.abs(Number(a[o]) - Number(b[o]))
    const dg = Math.abs(Number(a[o + 1]) - Number(b[o + 1]))
    const db = Math.abs(Number(a[o + 2]) - Number(b[o + 2]))
    const da = Math.abs(Number(a[o + 3]) - Number(b[o + 3]))
    if (Math.max(dr, dg, db, da) > channelThreshold) changed += 1
  }
  if (a.length !== b.length) return 1
  return changed / pixels
}

export function classifyVisualSafety(opts: {
  controlChangedRatio: number
  candidateChangedRatio: number
  maxChangedRatio?: number
}): { safe: boolean; visualDelta: boolean } {
  const maxChangedRatio = opts.maxChangedRatio ?? 0.02
  const floor = Math.max(maxChangedRatio, opts.controlChangedRatio)
  const visualDelta = opts.candidateChangedRatio > floor
  return { safe: !visualDelta, visualDelta }
}
