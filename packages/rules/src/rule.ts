import type { Finding, Rule, RuleContext } from './types.js'
import { drawCallsRule } from './rules/draw-calls.js'
import { lightsShadowsRule } from './rules/lights-shadows.js'
import { dprRule } from './rules/dpr.js'
import { materialsRule } from './rules/materials.js'
import { texturesRule } from './rules/textures.js'
import { rendererSetupRule } from './rules/renderer-setup.js'
import { lifecycleRule } from './rules/lifecycle.js'
import { transformsRule } from './rules/transforms.js'
import { frameloopRule } from './rules/frameloop.js'
import { trianglesRule } from './rules/triangles.js'
import { cullingRule } from './rules/culling.js'

export const defaultRules: Rule[] = [
  drawCallsRule,
  trianglesRule,
  lightsShadowsRule,
  dprRule,
  materialsRule,
  texturesRule,
  rendererSetupRule,
  lifecycleRule,
  transformsRule,
  cullingRule,
  frameloopRule,
]

export function runRules(ctx: RuleContext, rules: Rule[] = defaultRules): Finding[] {
  return rules.flatMap((rule) => rule.run(ctx))
}
