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
