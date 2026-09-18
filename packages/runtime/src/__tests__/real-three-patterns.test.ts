import { describe, it, expect } from 'vitest'
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Scene,
} from 'three'
import { collectHostSceneStats, readHostWorldRadius } from '../scene-stats.js'
import { InstanceLeakTracker } from '../instance-leak-tracker.js'
import { distanceCullPass } from '../passes/distance-cull.js'
import type { PassContext } from '../passes/types.js'

describe('real three.js InstancedMesh bounds', () => {
  it('world radius matches InstancedMesh.computeBoundingSphere, not geometry.boundingSphere', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    geometry.computeBoundingSphere()
    const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 2)
    const far = new Matrix4().setPosition(200, 0, 0)
    mesh.setMatrixAt(0, new Matrix4())
    mesh.setMatrixAt(1, far)
    mesh.instanceMatrix.needsUpdate = true
    mesh.updateMatrixWorld(true)
    const scene = new Scene()
    scene.add(mesh)

    const collected = collectHostSceneStats(
      scene,
      { info: { render: { calls: 1, triangles: 24 }, memory: { geometries: 1, textures: 0 } } },
      { far: 80 },
    )
    expect(collected.insights.oversizedBoundCount).toBe(1)

    mesh.computeBoundingSphere()
    expect(mesh.boundingSphere!.radius).toBeGreaterThan(geometry.boundingSphere!.radius * 10)
    expect(readHostWorldRadius(mesh)).toBeCloseTo(mesh.boundingSphere!.radius, 5)
    expect(readHostWorldRadius(mesh)).not.toBeCloseTo(geometry.boundingSphere!.radius, 1)
  })

  it('distance-cull keeps instances near the camera even when the mesh origin is far', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 1)
    mesh.setMatrixAt(0, new Matrix4().setPosition(200, 0, 0))
    mesh.instanceMatrix.needsUpdate = true
    mesh.updateMatrixWorld(true)
    const scene = new Scene()
    scene.add(mesh)
    const ctx: PassContext = {
      renderer: {
        info: { render: { calls: 1, triangles: 12 }, memory: { geometries: 1, textures: 0 } },
        setPixelRatio() {},
      },
      scene: scene as never,
      device: {
        tier: 'mid',
        maxTextureSize: 4096,
        webgl: true,
        webgpu: false,
        devicePixelRatio: 1,
        hardwareConcurrency: 4,
      },
      profile: 'game',
      postfxEnabled: false,
      frameloop: 'always',
      setFrameloop() {},
      cameraPosition: { x: 200, y: 0, z: 0 },
      cullDistance: 80,
    }
    distanceCullPass.apply(ctx)
    expect(mesh.visible).toBe(true)
  })

  it('tracks removed-without-dispose on a real InstancedMesh without breaking addEventListener this', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 4)
    const scene = new Scene()
    scene.add(mesh)
    const tracker = new InstanceLeakTracker()
    const renderer = { info: { render: { calls: 1, triangles: 48 }, memory: { geometries: 1, textures: 0 } } }
    expect(() => collectHostSceneStats(scene, renderer, undefined, { leakTracker: tracker })).not.toThrow()
    expect(tracker.snapshot().count).toBe(0)
    scene.remove(mesh)
    collectHostSceneStats(scene, renderer, undefined, { leakTracker: tracker })
    expect(tracker.snapshot().count).toBe(1)
    mesh.dispose()
    collectHostSceneStats(scene, renderer, undefined, { leakTracker: tracker })
    expect(tracker.snapshot().count).toBe(0)
  })
})
