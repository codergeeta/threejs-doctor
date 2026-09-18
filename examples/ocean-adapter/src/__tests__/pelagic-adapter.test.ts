import { describe, it, expect } from 'vitest'
import { createOceanAdapter, getPelagicDebug } from '../pelagic-adapter.js'
import type { PelagicDebugHandle, PelagicRtLike } from '../pelagic-debug.js'

interface HostCascade {
  size: number
  pack: { uniforms: { uGain: { value: number } } } | null
  displacement: { texture: { id: string } }
  normals: Array<{ texture: { id: string } }>
  normalIndex: number
  updates: number
  dispose: () => void
  update: (delta?: number) => void
  resize?: (n: number) => void
}

function hostLikeCascade(size: number): HostCascade {
  const cascade: HostCascade = {
    size,
    pack: { uniforms: { uGain: { value: 1.25 } } },
    displacement: { texture: { id: `disp-${size}` } },
    normals: [{ texture: { id: `n0-${size}` } }, { texture: { id: `n1-${size}` } }],
    normalIndex: 0,
    updates: 0,
    dispose() {},
    resize(n: number) {
      this.size = n
    },
    update() {
      if (this.pack == null) {
        throw new TypeError("Cannot read properties of null (reading 'pack')")
      }
      void this.pack.uniforms.uGain.value
      this.updates += 1
    },
  }
  return cascade
}

function hostLikeDebug(): PelagicDebugHandle & { hdrDeferred?: boolean } {
  const debug = fakeDebug()
  debug.cascades = [hostLikeCascade(128), hostLikeCascade(256), hostLikeCascade(128)]
  return debug
}

function hostSpectrumTick(debug: PelagicDebugHandle): void {
  debug.cascades!.forEach((cascade, i) => {
    const host = cascade as HostCascade
    const gain = host.pack!.uniforms.uGain
    void gain.value
    host.update(i === 0 ? 0.032 : 0.016)
  })
}

function hostWeatherTick(debug: PelagicDebugHandle): void {
  debug.cascades!.forEach((cascade) => {
    const gain = (cascade as HostCascade).pack!.uniforms.uGain
    gain.value = gain.value
  })
}

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

  it('applies fftSize [64,0,0], rtScale, meshLod, deferredHdr when those knobs are passed', () => {
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
    expect(debug.cascades![1]).not.toBeNull()
    expect(debug.cascades![1]?.size).toBe(256)
    expect(debug.cascades![2]?.size).toBe(128)
    expect(debug.reflectionTarget!.width).toBe(Math.round(768 * 0.35))
    expect(debug.causticWide!.width).toBe(Math.round(1024 * 0.35))
    expect(debug.causticDetail).not.toBeNull()
    expect(debug.causticDetail!.width).toBe(Math.round(1536 * 0.35))
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

  it('pauses updateSpectrum and runPass entirely when spectrumEveryNFrames is 0', () => {
    const debug = fakeDebug()
    const adapter = createOceanAdapter(debug)
    const handle = adapter.apply('potato', { spectrumEveryNFrames: 0 })
    debug.updateSpectrum?.()
    debug.updateSpectrum?.()
    debug.runPass?.()
    expect(adapter.readExtras?.()?.simPassCount).toBeUndefined()
    handle.rollback()
    debug.updateSpectrum?.()
    expect(adapter.readExtras?.()?.simPassCount).toBe(2)
  })

  it('keeps fftSize 0 cascade.update as a no-op when spectrum cadence is also applied', () => {
    const debug = hostLikeDebug()
    const adapter = createOceanAdapter(debug)
    adapter.apply('potato', { fftSize: [64, 0, 0], spectrumEveryNFrames: 8 })
    expect(() => hostSpectrumTick(debug)).not.toThrow()
    expect((debug.cascades![1] as HostCascade).updates).toBe(0)
    expect((debug.cascades![2] as HostCascade).updates).toBe(0)
    expect((debug.cascades![0] as HostCascade).updates).toBeGreaterThan(0)
  })

  it('no-ops update on every cascade when fftSize is all zeros, without disposing', () => {
    const debug = hostLikeDebug()
    const extra = hostLikeCascade(128)
    debug.cascades = [...debug.cascades!, extra]
    const adapter = createOceanAdapter(debug)
    const originals = [...debug.cascades]
    let disposed = 0
    for (const cascade of originals) {
      const host = cascade as HostCascade
      host.dispose = function (this: HostCascade) {
        disposed += 1
        this.pack = null as unknown as HostCascade['pack']
      }
    }
    const handle = adapter.apply('potato', {
      fftSize: [0, 0, 0],
      spectrumEveryNFrames: 0,
      effectQuality: 0,
    })
    expect(debug.cascades).toEqual(originals)
    expect(disposed).toBe(0)
    expect(() => hostSpectrumTick(debug)).not.toThrow()
    expect((debug.cascades[0] as HostCascade).updates).toBe(0)
    expect((debug.cascades[1] as HostCascade).updates).toBe(0)
    expect((debug.cascades[2] as HostCascade).updates).toBe(0)
    expect((extra as HostCascade).updates).toBe(0)
    expect(originals.every((c) => (c as HostCascade).pack !== null)).toBe(true)
    expect(debug.effectQuality).toBe(0)
    handle.rollback()
    expect(debug.effectQuality).toBe(1)
    hostSpectrumTick(debug)
    expect((debug.cascades[0] as HostCascade).updates).toBeGreaterThan(0)
  })

  it('keeps potato fftSize 64 on cascade 0 when a later all-zero freeze is stacked', () => {
    const debug = hostLikeDebug()
    const adapter = createOceanAdapter(debug)
    adapter.apply('potato', { fftSize: [64, 0, 0], spectrumEveryNFrames: 8 })
    expect(debug.cascades![0]!.size).toBe(64)
    adapter.apply('potato', { fftSize: [0, 0, 0], spectrumEveryNFrames: 0, effectQuality: 0 })
    expect(debug.cascades![0]!.size).toBe(64)
    expect(debug.cascades![0]).not.toBeNull()
    expect(() => hostSpectrumTick(debug)).not.toThrow()
    expect((debug.cascades![0] as HostCascade).updates).toBe(0)
    expect((debug.cascades![1] as HostCascade).updates).toBe(0)
    expect((debug.cascades![2] as HostCascade).updates).toBe(0)
  })

  it('forces lowest effectQuality when the knob is passed and skips when pelagic omits it', () => {
    const debug = fakeDebug()
    debug.effectQuality = 0.8
    const adapter = createOceanAdapter(debug)
    const handle = adapter.apply('potato', { effectQuality: 0 })
    expect(debug.effectQuality).toBe(0)
    handle.rollback()
    expect(debug.effectQuality).toBe(0.8)

    const bare: PelagicDebugHandle = {
      cascades: [{ size: 128, dispose() {}, resize(n: number) { this.size = n } }],
    }
    const silent = createOceanAdapter(bare)
    expect(() => silent.apply('potato', { effectQuality: 0, fftSize: [0] })).not.toThrow()
    expect(bare.effectQuality).toBeUndefined()
  })

  it('does not throw when cascades or RT targets are null', () => {
    const debug: PelagicDebugHandle = {
      cascades: [null, undefined, { size: 128, dispose() {}, resize(n: number) { this.size = n } }],
      refractionTarget: null as unknown as PelagicRtLike,
    }
    const adapter = createOceanAdapter(debug)
    expect(() =>
      adapter.apply('low', { fftSize: [128, 128, 128], rtScale: 0.5 }),
    ).not.toThrow()
    expect(debug.cascades![0]).toBeNull()
    expect(debug.cascades![2]?.size).toBe(128)
  })

  it('rolls back knobs and rethrows when FFT rebuild hits a null pack target', () => {
    const debug = fakeDebug()
    const originalWidth = debug.reflectionTarget!.width
    debug.cascades![1] = {
      size: 256,
      dispose() {},
      resize() {
        throw new TypeError("Cannot read properties of null (reading 'pack')")
      },
    }
    const adapter = createOceanAdapter(debug)
    expect(() =>
      adapter.apply('low', { fftSize: [64, 128, 128], rtScale: 0.5 }),
    ).toThrow(/pack/)
    expect(debug.cascades![0]!.size).toBe(128)
    expect(debug.reflectionTarget!.width).toBe(originalWidth)
  })

  it('keeps host cascade.pack materials after potato fftSize [64,0,0] so update/weather do not throw', () => {
    const debug = hostLikeDebug()
    const adapter = createOceanAdapter(debug)
    const original = debug.cascades![1]!
    adapter.apply('potato', {
      fftSize: [64, 0, 0],
      rtScale: 0.35,
      meshLod: 0,
      deferredHdr: true,
    })
    expect(debug.cascades![1]).toBe(original)
    expect(debug.cascades![1]).not.toBeNull()
    expect(() => hostSpectrumTick(debug)).not.toThrow()
    expect(() => hostWeatherTick(debug)).not.toThrow()
    expect((debug.cascades![1] as HostCascade).updates).toBe(0)
    expect((debug.cascades![0] as HostCascade).updates).toBeGreaterThan(0)
    expect(debug.causticDetail).not.toBeNull()
    expect(debug.causticDetail!.width).toBeGreaterThan(0)
  })

  it('does not dispose host cascades because dispose nulls pack and breaks later frames', () => {
    const debug = hostLikeDebug()
    const sea = debug.cascades![1] as HostCascade
    let disposed = false
    sea.dispose = function (this: HostCascade) {
      disposed = true
      this.pack = null as unknown as HostCascade['pack']
    }
    const adapter = createOceanAdapter(debug)
    adapter.apply('potato', { fftSize: [64, 0, 0] })
    expect(disposed).toBe(false)
    expect(sea.pack).not.toBeNull()
    expect(() => hostWeatherTick(debug)).not.toThrow()
  })

  it('skips fft size writes when the cascade has no resize, leaving ping/pack targets intact', () => {
    const debug = hostLikeDebug()
    const swell = debug.cascades![0] as HostCascade
    const prev = swell.size
    delete swell.resize
    const adapter = createOceanAdapter(debug)
    adapter.apply('potato', { fftSize: [64, 0, 0] })
    expect(swell.size).toBe(prev)
    expect(swell.pack).not.toBeNull()
    expect(() => hostSpectrumTick(debug)).not.toThrow()
  })

  it('does not replace BufferGeometry-like meshes via object spread on meshLod', () => {
    class FakeBufferGeometry {
      attributes = { position: { array: new Float32Array(9) } }
      getAttribute(name: string) {
        return this.attributes[name as 'position']
      }
    }
    const waterGeom = new FakeBufferGeometry()
    const terrainGeom = new FakeBufferGeometry()
    const debug = fakeDebug()
    debug.waterMesh = { geometry: waterGeom }
    debug.terrainMesh = { geometry: terrainGeom }
    const adapter = createOceanAdapter(debug)
    const handle = adapter.apply('low', { meshLod: 1 })
    const drawnWater = debug.waterMesh.geometry as FakeBufferGeometry
    const drawnTerrain = debug.terrainMesh.geometry as FakeBufferGeometry
    expect(drawnWater).toBe(waterGeom)
    expect(drawnTerrain).toBe(terrainGeom)
    expect(typeof drawnWater.getAttribute).toBe('function')
    expect(typeof drawnTerrain.getAttribute).toBe('function')
    handle.rollback()
    expect(debug.waterMesh.geometry).toBe(waterGeom)
    expect(debug.terrainMesh.geometry).toBe(terrainGeom)
  })

  it('skips an RT whose setSize throws and does not leave pack null', () => {
    const debug = hostLikeDebug()
    const reflectionPack = { uniforms: { uGain: { value: 1 } } }
    const prevW = debug.reflectionTarget!.width
    debug.reflectionTarget = {
      width: prevW,
      height: prevW,
      pack: reflectionPack,
      framebuffer: { id: 'fb-refl' },
      setSize() {
        throw new Error('resize failed')
      },
    } as PelagicRtLike
    const refractionW = debug.refractionTarget!.width
    const adapter = createOceanAdapter(debug)
    expect(() => adapter.apply('potato', { rtScale: 0.35 })).not.toThrow()
    expect(debug.reflectionTarget.width).toBe(prevW)
    expect((debug.reflectionTarget as PelagicRtLike & { pack: unknown }).pack).toBe(reflectionPack)
    expect(debug.refractionTarget!.width).toBe(Math.round(refractionW * 0.35))
    expect(() => hostWeatherTick(debug)).not.toThrow()
  })

  it('restores and skips an RT whose setSize leaves framebuffer null', () => {
    const debug = hostLikeDebug()
    const prevW = debug.reflectionTarget!.width
    const prevFb = { id: 'fb-ok' }
    debug.reflectionTarget = {
      width: prevW,
      height: prevW,
      framebuffer: prevFb as unknown,
      pack: { uniforms: {} },
      setSize(nw: number, nh: number) {
        this.width = nw
        this.height = nh
        this.framebuffer = null
      },
    } as PelagicRtLike & { framebuffer: unknown; pack: unknown }
    const adapter = createOceanAdapter(debug)
    adapter.apply('potato', { rtScale: 0.35 })
    expect(debug.reflectionTarget.width).toBe(prevW)
    expect(
      (debug.reflectionTarget as PelagicRtLike & { framebuffer: unknown }).framebuffer,
    ).toBe(prevFb)
    expect((debug.reflectionTarget as PelagicRtLike & { pack: unknown }).pack).not.toBeNull()
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

  it('forces effectQuality to 0 even after takeExclusiveControl froze the setter', () => {
    const debug = fakeDebug()
    debug.effectQuality = 0.8
    const adapter = createOceanAdapter(debug)
    adapter.takeExclusiveControl!()
    const handle = adapter.apply('potato', { effectQuality: 0 })
    expect(debug.effectQuality).toBe(0)
    handle.rollback()
    expect(debug.effectQuality).toBe(0.8)
  })
})
