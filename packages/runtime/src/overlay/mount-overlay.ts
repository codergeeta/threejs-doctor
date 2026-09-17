import type { MetricsSample } from '@threejs-doctor/core'

export interface OverlayHandle {
  unmount(): void
  refresh(): void
}

export interface MountOverlayOptions {
  getScore: () => number
  getBaseline: () => MetricsSample | undefined
  getAfter?: () => MetricsSample | undefined
  root?: ParentNode
}

function formatDeltas(baseline?: MetricsSample, after?: MetricsSample): string {
  if (!baseline || !after) return 'No after metrics'
  const keys: Array<keyof MetricsSample> = [
    'avgFps',
    'p95FrameTimeMs',
    'drawCalls',
    'triangles',
    'textureCount',
    'estimatedVramBytes',
    'geometryCount',
    'lightCount',
    'shadowCastingLightCount',
  ]
  return keys
    .map((k) => {
      const delta = after[k] - baseline[k]
      return `${String(k)}: ${delta >= 0 ? '+' : ''}${delta}`
    })
    .join(' · ')
}

export function mountOverlay(opts: MountOverlayOptions): OverlayHandle {
  const parent = opts.root ?? document.body
  document.getElementById('threejs-doctor-overlay')?.remove()
  const el = document.createElement('div')
  el.id = 'threejs-doctor-overlay'
  el.style.cssText =
    'position:fixed;z-index:99999;left:8px;bottom:8px;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.75);color:#fff;font:12px/1.4 ui-monospace,monospace;max-width:420px'
  const paint = () => {
    const score = opts.getScore()
    const deltas = formatDeltas(opts.getBaseline(), opts.getAfter?.())
    el.textContent = `Doctor Score ${score} | ${deltas}`
  }
  paint()
  parent.appendChild(el)
  return {
    refresh: paint,
    unmount() {
      el.remove()
    },
  }
}
