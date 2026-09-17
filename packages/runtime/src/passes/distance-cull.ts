import type { DoctorObjectLike, OptimizePass } from './types.js'

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
        if (!obj.isMesh || !obj.position) return
        const dist = obj.position.distanceTo(cam)
        if (dist > maxDist && obj.visible !== false) {
          touched.push({ obj, prev: obj.visible !== false })
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
