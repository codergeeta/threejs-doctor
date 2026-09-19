import { describe, it, expect } from 'vitest'
import { Doctor } from '../doctor.js'

function clock(step = 16) {
  let t = 0
  return () => {
    t += step
    return t
  }
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

function translation(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]
}

function indexedGeometry(triangles: number, uuid: string) {
  return {
    uuid,
    index: { count: triangles * 3 },
    boundingSphere: { radius: 1 },
  }
}

function rendererStub(triangles = 8_000) {
  return {
    info: {
      render: { calls: 40, triangles },
      memory: { geometries: 4, textures: 2 },
    },
    setPixelRatio() {},
    render() {},
  }
}

function doctorFor(scene: object, extra?: { camera?: object; renderer?: object; profile?: 'marketing' | 'product' | 'game' | 'cad' }) {
  return new Doctor({
    scene: scene as never,
    camera: extra?.camera ?? { far: 200, position: { x: 0, y: 2, z: 8 } },
    renderer: (extra?.renderer ?? rendererStub()) as never,
    profile: extra?.profile ?? 'game',
    measureFrames: 1,
    now: clock(),
  })
}

describe('P2: triangle budget and top contributors', () => {
  it('flags over-budget scene triangles and names the InstancedMesh that dominates', async () => {
    const trees = {
      isMesh: true,
      isInstancedMesh: true,
      name: 'trees',
      uuid: 'mesh-trees',
      count: 100,
      castShadow: true,
      frustumCulled: true,
      geometry: indexedGeometry(820, 'geo-tree'),
      material: { uuid: 'mat-tree' },
      matrixWorld: { elements: IDENTITY },
      instanceMatrix: { array: new Float32Array(100 * 16), count: 100 },
    }
    const curb = {
      isMesh: true,
      name: 'curb',
      uuid: 'mesh-curb',
      frustumCulled: true,
      geometry: indexedGeometry(180, 'geo-curb'),
      material: { uuid: 'mat-curb' },
      matrixWorld: { elements: IDENTITY },
    }
    const scene = {
      children: [trees, curb],
      traverse(cb: (o: object) => void) {
        cb(trees)
        cb(curb)
      },
    }
    const report = await doctorFor(scene, {
      profile: 'marketing',
      renderer: rendererStub(82_000 + 180),
    }).diagnose()
    const hit = report.findings.find((f) => f.id === 'triangles/too-many')
    expect(hit).toBeDefined()
    expect(Number(hit?.evidence.triangles)).toBe(82_000 + 180)
    expect(Number(hit?.evidence.geometryTriangleCount)).toBe(82_000 + 180)
    expect(Number(hit?.evidence.topContributorShare)).toBeCloseTo(82000 / 82180, 2)
    expect(String(hit?.evidence.topContributor)).toMatch(/trees/i)
    expect(hit?.message).toMatch(/82/)
  })

  it('omits triangle findings when mesh geometry has no index or position count', async () => {
    const mesh = {
      isMesh: true,
      geometry: { uuid: 'unknown' },
      material: { uuid: 'm' },
    }
    const scene = {
      children: [mesh],
      traverse(cb: (o: object) => void) {
        cb(mesh)
      },
    }
    const report = await doctorFor(scene).diagnose()
    expect(report.findings.some((f) => f.id === 'triangles/too-many')).toBe(false)
  })
})

describe('P2: meshes that cannot be culled', () => {
  it('flags frustumCulled === false', async () => {
    const mesh = {
      isMesh: true,
      frustumCulled: false,
      geometry: indexedGeometry(12, 'g'),
      material: { uuid: 'm' },
      matrixWorld: { elements: IDENTITY },
    }
    const scene = {
      children: [mesh],
      traverse(cb: (o: object) => void) {
        cb(mesh)
      },
    }
    const report = await doctorFor(scene).diagnose()
    const hit = report.findings.find((f) => f.id === 'culling/frustum-disabled')
    expect(hit).toBeDefined()
    expect(hit?.suggestedFix).toMatch(/frustumCulled|chunk/i)
  })

  it('flags world bounds larger than camera.far and omits that finding without camera.far', async () => {
    const huge = {
      isMesh: true,
      frustumCulled: true,
      geometry: {
        uuid: 'g-huge',
        index: { count: 36 },
        boundingSphere: { radius: 500 },
      },
      material: { uuid: 'm' },
      matrixWorld: { elements: IDENTITY },
    }
    const scene = {
      children: [huge],
      traverse(cb: (o: object) => void) {
        cb(huge)
      },
    }
    const withFar = await doctorFor(scene, { camera: { far: 100, position: { x: 0, y: 0, z: 5 } } }).diagnose()
    expect(withFar.findings.some((f) => f.id === 'culling/oversized-bounds')).toBe(true)

    const noFar = await doctorFor(scene, { camera: { position: { x: 0, y: 0, z: 5 } } }).diagnose()
    expect(noFar.findings.some((f) => f.id === 'culling/oversized-bounds')).toBe(false)
  })
})

describe('P2: shadow-pass cost', () => {
  it('counts instanced shadow casters toward shadow triangles', async () => {
    const trees = {
      isMesh: true,
      isInstancedMesh: true,
      name: 'trees',
      count: 80,
      castShadow: true,
      geometry: indexedGeometry(2_000, 'geo-tree'),
      material: { uuid: 'm' },
      matrixWorld: { elements: IDENTITY },
      instanceMatrix: { array: new Float32Array(80 * 16), count: 80 },
    }
    const light = {
      isLight: true,
      castShadow: true,
      intensity: 1,
      shadow: {
        camera: {
          isOrthographicCamera: true,
          left: -20,
          right: 20,
          top: 20,
          bottom: -20,
          near: 0.5,
          far: 80,
          matrixWorld: { elements: IDENTITY },
        },
      },
    }
    const scene = {
      children: [trees, light],
      traverse(cb: (o: object) => void) {
        cb(trees)
        cb(light)
      },
    }
    const report = await doctorFor(scene, { profile: 'marketing' }).diagnose()
    const hit = report.findings.find((f) => f.id === 'shadows/expensive-pass')
    expect(hit).toBeDefined()
    expect(Number(hit?.evidence.shadowTriangleCount)).toBe(160_000)
  })

  it('flags casters outside the shadow camera and omits that finding without a shadow camera', async () => {
    const farMesh = {
      isMesh: true,
      name: 'offscreen',
      castShadow: true,
      geometry: {
        uuid: 'g-far',
        index: { count: 36 },
        boundingSphere: { radius: 1 },
      },
      material: { uuid: 'm' },
      matrixWorld: { elements: translation(1_000, 0, 0) },
    }
    const lightWithCamera = {
      isLight: true,
      castShadow: true,
      intensity: 1,
      shadow: {
        camera: {
          isOrthographicCamera: true,
          left: -10,
          right: 10,
          top: 10,
          bottom: -10,
          near: 0.5,
          far: 50,
          matrixWorld: { elements: IDENTITY },
        },
      },
    }
    const withCam = {
      children: [farMesh, lightWithCamera],
      traverse(cb: (o: object) => void) {
        cb(farMesh)
        cb(lightWithCamera)
      },
    }
    const report = await doctorFor(withCam).diagnose()
    expect(report.findings.some((f) => f.id === 'shadows/casters-outside-frustum')).toBe(true)

    const lightNoCam = { isLight: true, castShadow: true, intensity: 1, shadow: {} }
    const noCam = {
      children: [farMesh, lightNoCam],
      traverse(cb: (o: object) => void) {
        cb(farMesh)
        cb(lightNoCam)
      },
    }
    const omitted = await doctorFor(noCam).diagnose()
    expect(omitted.findings.some((f) => f.id === 'shadows/casters-outside-frustum')).toBe(false)
  })
})

describe('P2: composer vs renderer pixel ratio', () => {
  it('flags a stale EffectComposer size vs the drawing buffer', async () => {
    const renderer = {
      ...rendererStub(),
      getPixelRatio: () => 2,
      drawingBufferWidth: 1600,
      drawingBufferHeight: 900,
      composer: {
        isEffectComposer: true,
        pixelRatio: 1,
        renderTarget1: {
          isWebGLRenderTarget: true,
          width: 800,
          height: 450,
          texture: { uuid: 'rt-composer' },
        },
      },
    }
    const scene = { children: [], traverse() {} }
    const report = await doctorFor(scene, { renderer }).diagnose()
    const hit = report.findings.find((f) => f.id === 'renderer/composer-resolution-mismatch')
    expect(hit).toBeDefined()
    expect(Number(hit?.evidence.composerWidth)).toBe(800)
    expect(Number(hit?.evidence.drawingBufferWidth)).toBe(1600)
  })

  it('does not invent a composer finding when none is detectable', async () => {
    const scene = { children: [], traverse() {} }
    const report = await doctorFor(scene).diagnose()
    expect(report.findings.some((f) => f.id === 'renderer/composer-resolution-mismatch')).toBe(false)
  })
})

describe('P2: intensity-0 lights still cost', () => {
  it('flags visible lights with intensity 0 and ignores hidden ones', async () => {
    const dead = { isLight: true, intensity: 0, visible: true, name: 'fill' }
    const hidden = { isLight: true, intensity: 0, visible: false, name: 'hidden' }
    const live = { isLight: true, intensity: 2, visible: true, name: 'sun' }
    const scene = {
      children: [dead, hidden, live],
      traverse(cb: (o: object) => void) {
        cb(dead)
        cb(hidden)
        cb(live)
      },
    }
    const report = await doctorFor(scene, { profile: 'product' }).diagnose()
    const hit = report.findings.find((f) => f.id === 'lights/zero-intensity')
    expect(hit).toBeDefined()
    expect(Number(hit?.evidence.zeroIntensityLightCount)).toBe(1)
    expect(hit?.suggestedFix).not.toMatch(/visible\s*=\s*false/i)
    expect(hit?.suggestedFix).not.toMatch(/intensity\s*=\s*0/i)
    expect(hit?.suggestedFix).toMatch(/pool/i)
    expect(hit?.suggestedFix).toMatch(/compile/i)
  })
})

describe('P2: InstancedMesh buffer leaks', () => {
  it('flags instance-buffer growth when geometry/texture counts stay flat', async () => {
    const instanceMatrix = { array: new Float32Array(8 * 16), count: 8 }
    const mesh = {
      isMesh: true,
      isInstancedMesh: true,
      count: 8,
      geometry: indexedGeometry(10, 'g-inst'),
      material: { uuid: 'm' },
      instanceMatrix,
    }
    const scene = {
      children: [mesh],
      traverse(cb: (o: object) => void) {
        cb(mesh)
      },
    }
    const renderer = rendererStub()
    const doctor = new Doctor({
      scene: scene as never,
      camera: {},
      renderer: renderer as never,
      profile: 'game',
      measureFrames: 1,
      now: clock(),
    })
    await doctor.measure()
    const first = await doctor.diagnose()
    expect(first.findings.some((f) => f.id === 'lifecycle/instance-buffer-growth')).toBe(false)

    mesh.count = 80
    instanceMatrix.array = new Float32Array(80 * 16)
    instanceMatrix.count = 80
    await doctor.measure()
    const second = await doctor.diagnose()
    const hit = second.findings.find((f) => f.id === 'lifecycle/instance-buffer-growth')
    expect(hit).toBeDefined()
    expect(second.findings.some((f) => f.id === 'lifecycle/resource-growth')).toBe(false)
    expect(Number(hit?.evidence.prevBytes)).toBeLessThan(Number(hit?.evidence.bytes))
  })
})
