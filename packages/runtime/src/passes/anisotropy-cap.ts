import { GENERIC_CAPS } from '@threejs-doctor/core'
import type { OptimizePass } from './types.js'

const MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
] as const

export const anisotropyCapPass: OptimizePass = {
  id: 'anisotropy-cap',
  apply(ctx) {
    const cap =
      ctx.qualityTier !== undefined
        ? GENERIC_CAPS[ctx.qualityTier].anisotropy
        : GENERIC_CAPS.low.anisotropy
    if (cap === undefined) return { rollback() {} }
    const touched: Array<{ tex: { anisotropy: number }; prev: number }> = []
    const restore = () => {
      for (const t of touched) t.tex.anisotropy = t.prev
    }
    try {
      ctx.scene.traverse((obj) => {
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
        for (const mat of mats) {
          if (!mat || typeof mat !== 'object') continue
          for (const key of MAP_KEYS) {
            const tex = (mat as Record<string, { anisotropy?: number } | undefined>)[key]
            if (!tex || typeof tex.anisotropy !== 'number') continue
            if (tex.anisotropy <= cap) continue
            touched.push({ tex: tex as { anisotropy: number }, prev: tex.anisotropy })
            tex.anisotropy = cap
          }
        }
      })
    } catch (err) {
      restore()
      throw err
    }
    return { rollback: restore }
  },
}
