import { describe, it, expect } from 'vitest'
import { createOceanAdapter, getPelagicDebug } from '../pelagic-adapter.js'
import type { PelagicDebugHandle } from '../pelagic-debug.js'

function fakeDebug(): PelagicDebugHandle & { hdrDeferred?: boolean } {
  const rt = (w: number, h: number) => ({
    width: w,
    height: h,
    setSize(nw: number, nh: number) {
      this.width = nw
      this.height = nh
    },
  })
  const debug: PelagicDebugHandle & { hdrDeferred?: boolean } = {
    cascades: [
      { size: 128, dispose() {}, resize(n: number) { this.size = n } },
      { size: 256, dispose() {}, resize(n: number) { this.size = n } },
      { size: 128, dispose() {}, resize(n: number) { this.size = n } },
    ],
    reflectionTarget: rt(768, 768),
    refractionTarget: rt(768, 768),
    causticWide: rt(1024, 1024),
    causticDetail: rt(1536, 1536),
    waterMesh: { geometry: { type: 'clipmap' } },
    terrainMesh: { geometry: { type: 'terrain' } },
    effectQuality: 1,
    dprLoop: { enabled: true },
    runPass() {},
    updateSpectrum() {
      debug.runPass?.()
      debug.runPass?.()
    },
  }
  return debug
}

describe('createOceanAdapter', () => {
  it('returns no capabilities when pelagic.debug is missing', () => {
    const adapter = createOceanAdapter(undefined)
    expect(adapter.id).toBe('ocean-pelagic')
    expect(adapter.capabilities()).toEqual([])
  })

  it('reads window.pelagic.debug via getPelagicDebug', () => {
    const g = globalThis as { pelagic?: { debug: PelagicDebugHandle } }
    const debug = fakeDebug()
    g.pelagic = { debug }
    expect(getPelagicDebug(g)?.reflectionTarget).toBe(debug.reflectionTarget)
    delete g.pelagic
  })

  it('applies potato fftSize [64,0,0], rtScale 0.35, meshLod 0, deferredHdr true', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    expect(adapter.capabilities().sort()).toEqual(
      ['deferredHdr', 'fftSize', 'meshLod', 'rtScale', 'simPassCount'].sort(),
    )
    const handle = adapter.apply('potato', {
      fftSize: [64, 0, 0],
      rtScale: 0.35,
      meshLod: 0,
      deferredHdr: true,
    })
    expect(debug.cascades![0]!.size).toBe(64)
    expect(debug.cascades![1]).toBeNull()
    expect(debug.cascades![2]).toBeNull()
    expect(debug.reflectionTarget!.width).toBe(Math.round(768 * 0.35))
    expect(debug.causticWide!.width).toBe(Math.round(1024 * 0.35))
    expect(debug.causticDetail).toBeNull()
    expect(debug.hdrDeferred).toBe(true)
    handle.rollback()
    expect(debug.cascades![1]?.size).toBe(256)
    expect(debug.reflectionTarget!.width).toBe(768)
  })

  it('applies low compact knobs [128,128,128] / 0.50 / lod 1', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    adapter.apply('low', {
      fftSize: [128, 128, 128],
      rtScale: 0.5,
      meshLod: 1,
      deferredHdr: true,
    })
    expect(debug.cascades!.map((c) => c?.size)).toEqual([128, 128, 128])
    expect(debug.reflectionTarget!.width).toBe(Math.round(768 * 0.5))
  })

  it('ignores unsupported knob keys without throwing', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    expect(() =>
      adapter.apply('mid', { rtScale: 0.7, fftSize: [128, 256, 128] }),
    ).not.toThrow()
  })

  it('readExtras returns simPassCount only after wrapped spectrum work', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    expect(adapter.readExtras?.()?.simPassCount).toBeUndefined()
    debug.updateSpectrum?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(2)
  })

  it('honors spectrumEveryNFrames on updateSpectrum/runPass and restores on rollback', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    const handle = adapter.apply('potato', { spectrumEveryNFrames: 2 })
    debug.updateSpectrum?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(2)
    debug.updateSpectrum?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(2)
    debug.runPass?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(2)
    debug.updateSpectrum?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(4)
    handle.rollback()
    debug.updateSpectrum?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(6)
    debug.runPass?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(7)
  })

  it('takeExclusiveControl freezes effectQuality and host dpr loop', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    debug.effectQuality = 0.8
    const exclusive = adapter.takeExclusiveControl!()
    debug.effectQuality = 1
    expect(debug.effectQuality).toBe(0.8)
    expect(debug.dprLoop!.enabled).toBe(false)
    exclusive.release()
    expect(debug.dprLoop!.enabled).toBe(true)
    debug.effectQuality = 1
    expect(debug.effectQuality).toBe(1)
  })
})
