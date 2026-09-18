import type { Rule } from '../types.js'
import { resolveProfile } from '../profiles.js'

function composerResolutionMismatch(snapshot: {
  composerPixelRatio?: number | undefined
  composerWidth?: number | undefined
  composerHeight?: number | undefined
  drawingBufferWidth?: number | undefined
  drawingBufferHeight?: number | undefined
  rendererPixelRatio?: number | undefined
}): boolean {
  const detected =
    snapshot.composerWidth !== undefined ||
    snapshot.composerHeight !== undefined ||
    snapshot.composerPixelRatio !== undefined
  if (!detected) return false
  const cpr = snapshot.composerPixelRatio
  const rpr = snapshot.rendererPixelRatio
  if (typeof cpr === 'number' && typeof rpr === 'number' && Math.abs(cpr - rpr) > 0.05) {
    return true
  }
  const cw = snapshot.composerWidth
  const ch = snapshot.composerHeight
  const dw = snapshot.drawingBufferWidth
  const dh = snapshot.drawingBufferHeight
  if (
    typeof cw === 'number' &&
    typeof ch === 'number' &&
    typeof dw === 'number' &&
    typeof dh === 'number' &&
    dw > 0 &&
    dh > 0
  ) {
    const ratio = (cw * ch) / (dw * dh)
    if (ratio < 0.9 || ratio > 1.1) return true
  }
  return false
}

export const rendererSetupRule: Rule = {
  id: 'renderer-setup',
  run(ctx) {
    const findings = []
    const profile = resolveProfile(ctx.profile, ctx.snapshot)
    if (ctx.snapshot.antialias && ctx.device.tier === 'low' && (profile === 'marketing' || profile === 'product')) {
      findings.push({
        id: 'renderer/antialias-postfx-risk',
        severity: 'warn' as const,
        evidence: { antialias: true, tier: ctx.device.tier, profile },
        message: 'Antialias on low-tier marketing/product scenes risks costly post stacks',
        suggestedFix: 'Disable MSAA on low tier or reduce postfx via postfx-budget',
        autoFix: 'postfx-budget' as const,
      })
    }
    if (composerResolutionMismatch(ctx.snapshot)) {
      const evidence: Record<string, number | string | boolean> = {}
      if (typeof ctx.snapshot.composerWidth === 'number') evidence.composerWidth = ctx.snapshot.composerWidth
      if (typeof ctx.snapshot.composerHeight === 'number') evidence.composerHeight = ctx.snapshot.composerHeight
      if (typeof ctx.snapshot.composerPixelRatio === 'number') {
        evidence.composerPixelRatio = ctx.snapshot.composerPixelRatio
      }
      if (typeof ctx.snapshot.drawingBufferWidth === 'number') {
        evidence.drawingBufferWidth = ctx.snapshot.drawingBufferWidth
      }
      if (typeof ctx.snapshot.drawingBufferHeight === 'number') {
        evidence.drawingBufferHeight = ctx.snapshot.drawingBufferHeight
      }
      if (typeof ctx.snapshot.rendererPixelRatio === 'number') {
        evidence.rendererPixelRatio = ctx.snapshot.rendererPixelRatio
      }
      findings.push({
        id: 'renderer/composer-resolution-mismatch',
        severity: 'warn' as const,
        evidence,
        message: 'EffectComposer internal size/pixel ratio is stale vs the renderer drawing buffer',
        suggestedFix: 'Call composer.setSize / setPixelRatio whenever the renderer resizes or DPR changes',
      })
    }
    return findings
  },
}
