import type { DoctorObjectLike, OptimizePass } from './types.js'

type Vec3 = { x: number; y: number; z: number }

function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function transformPoint(elements: ArrayLike<number>, p: Vec3): Vec3 {
  const x = p.x
  const y = p.y
  const z = p.z
  const w = elements[3]! * x + elements[7]! * y + elements[11]! * z + elements[15]!
  const invW = w !== 0 && Number.isFinite(w) ? 1 / w : 1
  return {
    x: (elements[0]! * x + elements[4]! * y + elements[8]! * z + elements[12]!) * invW,
    y: (elements[1]! * x + elements[5]! * y + elements[9]! * z + elements[13]!) * invW,
    z: (elements[2]! * x + elements[6]! * y + elements[10]! * z + elements[14]!) * invW,
  }
}

function worldAabb(obj: DoctorObjectLike): { min: Vec3; max: Vec3 } | undefined {
  const geom = obj.geometry
  if (!geom) return undefined
  if (!geom.boundingBox && typeof geom.computeBoundingBox === 'function') {
    try {
      geom.computeBoundingBox()
    } catch {
      // ignore
    }
  }
  const box = geom.boundingBox
  if (!box?.min || !box?.max || !isFiniteVec(box.min) || !isFiniteVec(box.max)) return undefined
  const corners: Vec3[] = [
    { x: box.min.x, y: box.min.y, z: box.min.z },
    { x: box.min.x, y: box.min.y, z: box.max.z },
    { x: box.min.x, y: box.max.y, z: box.min.z },
    { x: box.min.x, y: box.max.y, z: box.max.z },
    { x: box.max.x, y: box.min.y, z: box.min.z },
    { x: box.max.x, y: box.min.y, z: box.max.z },
    { x: box.max.x, y: box.max.y, z: box.min.z },
    { x: box.max.x, y: box.max.y, z: box.max.z },
  ]
  const elements = obj.matrixWorld?.elements
  const worldCorners =
    elements && elements.length >= 16 ? corners.map((c) => transformPoint(elements, c)) : undefined
  if (!worldCorners) return undefined
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const c of worldCorners) {
    if (!isFiniteVec(c)) return undefined
    min.x = Math.min(min.x, c.x)
    min.y = Math.min(min.y, c.y)
    min.z = Math.min(min.z, c.z)
    max.x = Math.max(max.x, c.x)
    max.y = Math.max(max.y, c.y)
    max.z = Math.max(max.z, c.z)
  }
  return { min, max }
}

/**
 * World-space distance from the camera to the mesh. Local `position` is never used:
 * GLB/instanced children sit at local 0 while their parent is far from the origin.
 * One-shot: hosts must re-run or apply a per-frame variant as the camera moves.
 */
function worldDistanceToCamera(obj: DoctorObjectLike, cam: Vec3): number | undefined {
  const aabb = worldAabb(obj)
  if (aabb) {
    const closest = {
      x: Math.min(aabb.max.x, Math.max(aabb.min.x, cam.x)),
      y: Math.min(aabb.max.y, Math.max(aabb.min.y, cam.y)),
      z: Math.min(aabb.max.z, Math.max(aabb.min.z, cam.z)),
    }
    return distance(closest, cam)
  }
  if (typeof obj.getWorldPosition !== 'function') return undefined
  const pos = { x: 0, y: 0, z: 0 }
  try {
    obj.getWorldPosition(pos)
  } catch {
    return undefined
  }
  if (!isFiniteVec(pos)) return undefined
  const radius = obj.geometry?.boundingSphere?.radius
  const dist = distance(pos, cam)
  if (typeof radius === 'number' && Number.isFinite(radius) && radius > 0) {
    return Math.max(0, dist - radius)
  }
  return dist
}

export const distanceCullPass: OptimizePass = {
  id: 'distance-cull',
  apply(ctx) {
    const cam = ctx.cameraPosition ?? { x: 0, y: 0, z: 0 }
    const maxDist = ctx.cullDistance ?? 80
    const touched: Array<{ obj: DoctorObjectLike; prev: boolean }> = []
    const rollbackTouched = () => {
      for (const t of touched) t.obj.visible = t.prev
    }
    try {
      ctx.scene.traverse((obj) => {
        if (!obj.isMesh) return
        const dist = worldDistanceToCamera(obj, cam)
        if (dist === undefined || !Number.isFinite(dist)) return
        const wasVisible = obj.visible !== false
        if (dist > maxDist && wasVisible) {
          touched.push({ obj, prev: wasVisible })
          obj.visible = false
        }
      })
    } catch (err) {
      rollbackTouched()
      throw err
    }
    return {
      rollback() {
        rollbackTouched()
      },
    }
  },
}
