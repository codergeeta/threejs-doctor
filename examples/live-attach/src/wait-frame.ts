export function readRenderFrame(renderer: unknown): number | undefined {
  const frame = (renderer as { info?: { render?: { frame?: unknown } } })?.info?.render?.frame
  return typeof frame === 'number' ? frame : undefined
}

/**
 * Wait for the host renderer to advance `info.render.frame`.
 * Falls back to one rAF (or a no-op) when that counter is absent — never invents FPS.
 */
export function waitLiveFrame(
  renderer: unknown,
  schedule: (cb: () => void) => void = (cb) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cb())
    else cb()
  },
  maxTicks = 180,
): () => Promise<void> {
  return () =>
    new Promise((resolve) => {
      const start = readRenderFrame(renderer)
      if (start === undefined) {
        schedule(() => resolve())
        return
      }
      let ticks = 0
      const tick = () => {
        const current = readRenderFrame(renderer)
        if (current !== undefined && current !== start) {
          resolve()
          return
        }
        ticks += 1
        if (ticks >= maxTicks) {
          resolve()
          return
        }
        schedule(tick)
      }
      schedule(tick)
    })
}
