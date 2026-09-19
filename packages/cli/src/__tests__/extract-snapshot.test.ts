import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractStaticFacts, factsToSnapshot } from '../scan/extract-snapshot.js'

const here = dirname(fileURLToPath(import.meta.url))

function load(rel: string): string {
  return readFileSync(resolve(here, rel), 'utf8')
}

describe('extractStaticFacts', () => {
  it('counts lights, shadow casters, meshes, and continuous rAF from JS', () => {
    const facts = extractStaticFacts([
      { path: 'scene.js', source: load('fixtures/heavy-static/scene.js') },
    ])
    expect(facts.sawThree).toBe(true)
    expect(facts.lightCount).toBe(7)
    expect(facts.shadowCastingLightCount).toBe(4)
    expect(facts.meshCount).toBe(3)
    expect(facts.materialCount).toBe(3)
    expect(facts.continuousFrameloop).toBe(true)
    expect(facts.antialias).toBe(true)
    expect(facts.uncappedDevicePixelRatio).toBe(true)
    expect(facts.frustumCulledDisabledCount).toBe(1)
  })

  it('does not invent an uncapped DPR when setPixelRatio is capped', () => {
    const facts = extractStaticFacts([
      { path: 'scene.js', source: load('fixtures/healthy-static/scene.js') },
    ])
    expect(facts.sawThree).toBe(true)
    expect(facts.lightCount).toBe(2)
    expect(facts.shadowCastingLightCount).toBe(0)
    expect(facts.continuousFrameloop).toBe(false)
    expect(facts.uncappedDevicePixelRatio).toBe(false)
    expect(facts.pixelRatioCap).toBe(1.5)
    expect(facts.antialias).toBe(false)
  })

  it('reads THREE.* constructors inside HTML script tags', () => {
    const facts = extractStaticFacts([
      { path: 'index.html', source: load('fixtures/html-three/index.html') },
    ])
    expect(facts.sawThree).toBe(true)
    expect(facts.lightCount).toBe(4)
    expect(facts.shadowCastingLightCount).toBe(3)
    expect(facts.continuousFrameloop).toBe(true)
    expect(facts.uncappedDevicePixelRatio).toBe(true)
  })

  it('ignores commented-out constructors', () => {
    const facts = extractStaticFacts([
      {
        path: 'commented.ts',
        source: `
          import { DirectionalLight } from 'three'
          // const dead = new DirectionalLight()
          /* new PointLight() */
          const live = new DirectionalLight()
        `,
      },
    ])
    expect(facts.lightCount).toBe(1)
  })

  it('counts TypeScript-typed and this-bound lights that enable castShadow', () => {
    const facts = extractStaticFacts([
      {
        path: 'typed.ts',
        source: `
          import { DirectionalLight, PointLight } from 'three'
          const sun: DirectionalLight = new DirectionalLight()
          sun.castShadow = true
          class Scene {
            fill = new PointLight()
            setup() {
              this.spot = new SpotLight()
              this.spot.castShadow = true
              this.fill.castShadow = true
            }
          }
        `,
      },
    ])
    expect(facts.lightCount).toBe(3)
    expect(facts.shadowCastingLightCount).toBe(3)
  })

  it('counts import aliases of Three.js light constructors', () => {
    const facts = extractStaticFacts([
      {
        path: 'alias.ts',
        source: `
          import { DirectionalLight as Sun, PointLight as Fill } from 'three'
          const a = new Sun()
          a.castShadow = true
          new Fill()
        `,
      },
    ])
    expect(facts.lightCount).toBe(2)
    expect(facts.shadowCastingLightCount).toBe(1)
  })

  it('treats any uncapped setPixelRatio as uncapped even if another file caps', () => {
    const facts = extractStaticFacts([
      {
        path: 'helper.ts',
        source: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))`,
      },
      {
        path: 'demo.ts',
        source: `import { WebGLRenderer } from 'three'\nconst r = new WebGLRenderer()\nr.setPixelRatio(window.devicePixelRatio)`,
      },
    ])
    expect(facts.uncappedDevicePixelRatio).toBe(true)
  })

  it('detects anonymous rAF + render loops and ignores non-R3F Canvas tags', () => {
    const loop = extractStaticFacts([
      {
        path: 'loop.ts',
        source: `
          import { WebGLRenderer } from 'three'
          const renderer = new WebGLRenderer()
          requestAnimationFrame(() => { renderer.render(scene, camera) })
        `,
      },
    ])
    expect(loop.continuousFrameloop).toBe(true)

    const canvas = extractStaticFacts([
      {
        path: 'ui.tsx',
        source: `export function App() { return <Canvas width={100} /> }`,
      },
    ])
    expect(canvas.continuousFrameloop).toBe(false)
    expect(canvas.sawThree).toBe(false)
  })

  it('does not treat mesh.castShadow as a shadow-casting light', () => {
    const facts = extractStaticFacts([
      {
        path: 'mesh-shadow.ts',
        source: `
          import { DirectionalLight, Mesh } from 'three'
          const light = new DirectionalLight()
          const mesh = new Mesh()
          mesh.castShadow = true
        `,
      },
    ])
    expect(facts.lightCount).toBe(1)
    expect(facts.shadowCastingLightCount).toBe(0)
    expect(facts.meshCount).toBe(1)
  })

  it('counts positional intensity 0 on PointLight/SpotLight constructors', () => {
    const facts = extractStaticFacts([
      {
        path: 'fx.ts',
        source: `
          import { PointLight, SpotLight, AmbientLight } from 'three'
          new PointLight(0x66ccff, 0, 22, 2)
          new SpotLight(0xffffff, 0, 12, Math.PI / 6)
          new AmbientLight(0x404040)
        `,
      },
    ])
    expect(facts.lightCount).toBe(3)
    expect(facts.zeroIntensityLightCount).toBe(2)
  })

  it('counts non-literal-false castShadow assignments on lights', () => {
    const facts = extractStaticFacts([
      {
        path: 'sun.ts',
        source: `
          import { DirectionalLight } from 'three'
          const sun = new DirectionalLight()
          sun.castShadow = this.quality !== 'low'
          const fill = new DirectionalLight()
          fill.castShadow = false
        `,
      },
    ])
    expect(facts.lightCount).toBe(2)
    expect(facts.shadowCastingLightCount).toBe(1)
  })

  it('does not count Points/Line/Sprite frustumCulled=false as mesh culling errors', () => {
    const facts = extractStaticFacts([
      {
        path: 'fx.ts',
        source: `
          import { Points, Line, Sprite, Mesh, BufferGeometry, PointsMaterial } from 'three'
          const sparks = new Points(new BufferGeometry(), new PointsMaterial())
          sparks.frustumCulled = false
          const trail = new Line()
          trail.frustumCulled = false
          const glow = new Sprite()
          glow.frustumCulled = false
          const car = new Mesh()
          car.frustumCulled = false
        `,
      },
    ])
    expect(facts.frustumCulledDisabledCount).toBe(1)
    expect(facts.frustumCulledDisabledFxCount).toBe(3)
  })

  it('records file:line for constructors and flags EffectComposer pixel-ratio drift', () => {
    const source = [
      "import { WebGLRenderer } from 'three'",
      "import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'",
      'const renderer = new WebGLRenderer()',
      'const composer = new EffectComposer(renderer)',
      'renderer.setPixelRatio(window.devicePixelRatio)',
    ].join('\n')
    const facts = extractStaticFacts([{ path: 'post.js', source }])
    expect(facts.composerCtorCount).toBe(1)
    expect(facts.composerPixelRatioSynced).toBe(false)
    expect(facts.locations.effectComposer[0]).toMatchObject({ file: 'post.js', line: 4 })
    expect(facts.locations.setPixelRatio[0]).toMatchObject({ file: 'post.js', line: 5 })
    expect(facts.locations.rendererCtor[0]?.line).toBe(3)
  })

  it('treats composer.setPixelRatio or composer.setSize as synced', () => {
    const synced = extractStaticFacts([
      {
        path: 'ok.js',
        source: `
          import { EffectComposer } from 'postprocessing'
          const composer = new EffectComposer(renderer)
          renderer.setPixelRatio(dpr)
          composer.setPixelRatio(dpr)
        `,
      },
    ])
    expect(synced.composerCtorCount).toBe(1)
    expect(synced.composerPixelRatioSynced).toBe(true)

    const sized = extractStaticFacts([
      {
        path: 'ok2.js',
        source: `
          const composer = new EffectComposer(gl)
          renderer.setPixelRatio(2)
          composer.setSize(w, h)
        `,
      },
    ])
    expect(sized.composerPixelRatioSynced).toBe(true)
  })
})

describe('factsToSnapshot', () => {
  it('omits unknown runtime metrics instead of inventing draw calls or VRAM', () => {
    const facts = extractStaticFacts([
      { path: 'scene.js', source: load('fixtures/heavy-static/scene.js') },
    ])
    const snap = factsToSnapshot(facts, { assumedDevicePixelRatio: 2 })
    expect(snap.lightCount).toBe(7)
    expect(snap.shadowCastingLightCount).toBe(4)
    expect(snap.drawCalls).toBe(0)
    expect(snap.triangles).toBe(0)
    expect(snap.estimatedVramBytes).toBe(0)
    expect(snap.rendererPixelRatio).toBeUndefined()
    expect(snap.antialias).toBe(true)
  })

  it('records a known pixel-ratio cap and omits rendererPixelRatio when unset', () => {
    const capped = factsToSnapshot(
      extractStaticFacts([{ path: 'scene.js', source: load('fixtures/healthy-static/scene.js') }]),
      { assumedDevicePixelRatio: 2 },
    )
    expect(capped.rendererPixelRatio).toBe(1.5)

    const unset = factsToSnapshot(
      extractStaticFacts([
        {
          path: 'bare.ts',
          source: `import { WebGLRenderer } from 'three'\nnew WebGLRenderer()\n`,
        },
      ]),
      { assumedDevicePixelRatio: 2 },
    )
    expect(unset.rendererPixelRatio).toBeUndefined()
  })
})
