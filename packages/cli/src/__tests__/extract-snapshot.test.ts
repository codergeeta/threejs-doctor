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
    expect(snap.rendererPixelRatio).toBe(2)
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
