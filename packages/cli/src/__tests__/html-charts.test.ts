import { describe, it, expect } from 'vitest'
import { formatHtmlReport } from '../report/html.js'
import { EXAMPLE_REPORT } from '../report/example-report.js'
import { PROFILE_BUDGETS } from '@threejs-doctor/rules'

/** Resource loads (src/href/url/@import). Navigation <a href> is stripped first. */
const EXTERNAL_RESOURCE_REF =
  /(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|@import\s+["']https?:\/\//i

function withoutNavAnchors(html: string): string {
  return html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
}

function svgOpenTags(html: string): string[] {
  return html.match(/<svg\b[^>]*>/g) ?? []
}

const runtimeBase = {
  profile: 'game' as const,
  mode: 'optimize',
  score: 80,
  findings: [],
  baseline: {
    avgFps: 30,
    p95FrameTimeMs: 40,
    drawCalls: 140,
    triangles: 100_000,
    textureCount: 6,
    geometryCount: 20,
    lightCount: 2,
    shadowCastingLightCount: 1,
  },
  after: {
    avgFps: 45,
    p95FrameTimeMs: 24,
    drawCalls: 70,
    triangles: 21_000,
    textureCount: 6,
    geometryCount: 20,
    lightCount: 2,
    shadowCastingLightCount: 1,
  },
  claimed: { triangles: 'win', drawCalls: 'win', avgFps: 'win' },
  noiseBand: {
    triangles: { abs: 100, rel: 0.01 },
    drawCalls: { abs: 2, rel: 0.02 },
    avgFps: { abs: 1, rel: 0.02 },
  },
}

describe('HTML report charts (Part C)', () => {
  it('example report renders every chart with numbers visible and no external http(s) resources', () => {
    const html = formatHtmlReport(EXAMPLE_REPORT)
    expect(html).toContain('<h2>Deltas vs noise</h2>')
    expect(html).toContain('<h2>Cost attribution</h2>')
    expect(html).toContain('<h2>GPU time per pass</h2>')
    expect(html).toContain('<h2>Frame-time histogram</h2>')
    expect(html).toContain('<h2>Triangle budget</h2>')
    expect(html).toContain('<h2>Score trend</h2>')
    expect(html).toContain('<h2>Visuals</h2>')
    expect(html).toContain('21000')
    expect(html).toContain('2.5')
    expect(html).toContain('shadow')
    expect(html).toContain('p50')
    expect(html).toContain('p95')
    expect(html).toContain(String(PROFILE_BUDGETS.game.maxTriangles))
    const noNav = withoutNavAnchors(html)
    expect(noNav).not.toMatch(EXTERNAL_RESOURCE_REF)
    expect(noNav).not.toMatch(/https?:\/\//i)
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(2 * 1024 * 1024)
    expect(html).not.toContain('<script src=')
    expect(html).not.toContain('<link ')
  })

  it('gives every SVG a viewBox, role="img", and aria-label', () => {
    const html = formatHtmlReport(EXAMPLE_REPORT)
    const opens = svgOpenTags(html)
    expect(opens.length).toBeGreaterThanOrEqual(6)
    for (const tag of opens) {
      expect(tag).toMatch(/viewBox="/)
      expect(tag).toContain('role="img"')
      expect(tag).toMatch(/aria-label="/)
    }
  })

  it('draws delta bars with a noise-band rect and ▲/▼/● markers (not colour alone)', () => {
    const html = formatHtmlReport(runtimeBase)
    expect(html).toContain('<h2>Deltas vs noise</h2>')
    expect(html).toContain('noise-band')
    expect(html).toMatch(/[▲▼●]/)
    expect(html).toContain('100000')
    expect(html).toContain('21000')
    expect(html).toContain('scaleX')
  })

  it('hatches the shadow-map portion of the cost stacked bar and keeps a table', () => {
    const html = formatHtmlReport({
      ...runtimeBase,
      gpuPassTimes: [
        { pass: 'main', gpuFrameTimeMs: 8 },
        { pass: 'shadow', gpuFrameTimeMs: 2.5 },
      ],
    })
    expect(html).toContain('<h2>Cost attribution</h2>')
    expect(html).toContain('hatch-shadow')
    expect(html).toMatch(/<pattern\b[^>]*id="hatch-shadow"/)
    expect(html).toContain('url(#hatch-shadow)')
    expect(html).toContain('<table')
    expect(html).toContain('shadow')
    expect(html).toContain('2.5')
    expect(html).toContain('main')
    expect(html).toContain('8')
  })

  it('renders a GPU-per-pass stacked bar, or a not-measured placeholder', () => {
    const measured = formatHtmlReport({
      ...runtimeBase,
      gpuPassTimes: [{ pass: 'shadow', gpuFrameTimeMs: 2.5 }],
    })
    expect(measured).toContain('<h2>GPU time per pass</h2>')
    expect(measured).toContain('2.5')
    expect(measured).not.toContain('not measured on this device')
    expect(svgOpenTags(measured).some((tag) => /aria-label="[^"]*GPU/i.test(tag))).toBe(true)

    const missing = formatHtmlReport(runtimeBase)
    expect(missing).toContain('not measured on this device')
    expect(missing).not.toContain('<h2>Cost attribution</h2>')
  })

  it('builds a frame-time histogram with p50/p95 only when frameTimesMs is present', () => {
    expect(formatHtmlReport(runtimeBase)).not.toContain('<h2>Frame-time histogram</h2>')
    const times = [31, 31, 32, 32, 32, 32, 33, 33, 33, 33, 33, 34, 34, 34, 35, 35, 36, 37, 39, 40]
    const html = formatHtmlReport({ ...runtimeBase, frameTimesMs: times })
    expect(html).toContain('<h2>Frame-time histogram</h2>')
    expect(html).toContain('p50')
    expect(html).toContain('p95')
    expect(html).toContain('33')
    expect(html).toContain('40')
  })

  it('gauges triangles against the profile budget', () => {
    const html = formatHtmlReport(runtimeBase)
    expect(html).toContain('<h2>Triangle budget</h2>')
    expect(html).toContain('21000')
    expect(html).toContain(String(PROFILE_BUDGETS.game.maxTriangles))
    expect(html).toContain('game')
    const unknown = formatHtmlReport({ ...runtimeBase, profile: 'unknown' })
    expect(unknown).not.toContain('<h2>Triangle budget</h2>')
  })

  it('draws a trend with line, dots, y ticks, commit labels, area gradient, and per-point titles', () => {
    const html = formatHtmlReport({
      ...runtimeBase,
      history: [
        { commit: 'pre-fix', score: 66 },
        { commit: 'post-fix', score: 74 },
      ],
    })
    expect(html).toContain('<h2>Score trend</h2>')
    expect(html).toContain('<polyline')
    expect(html).toContain('<circle')
    expect(html).toContain('<title>')
    expect(html).toContain('pre-fix')
    expect(html).toContain('post-fix')
    expect(html).toContain('linearGradient')
    expect(html).toContain('stroke-dashoffset')
    expect(html).toMatch(/>66</)
    expect(html).toMatch(/>100</)
  })

  it('kills animation under reduced-motion and print, and animates bars/line/cards otherwise', () => {
    const html = formatHtmlReport(EXAMPLE_REPORT)
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    const reduced = html.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation\s*:\s*none[\s\S]*?transition\s*:\s*none[\s\S]*?\}/,
    )
    expect(reduced).not.toBeNull()
    expect(html).toContain('@media print')
    expect(html).toMatch(/@media print\s*\{[\s\S]*animation\s*:\s*none/)
    expect(html).toContain('scaleX')
    expect(html).toContain('stroke-dashoffset')
    expect(html).toContain('fade-up')
  })

  it('uses a CSS-only before/after slider (range + clip-path) with optional diff radio', () => {
    const html = formatHtmlReport(EXAMPLE_REPORT)
    expect(html).toContain('type="range"')
    expect(html).toContain('clip-path')
    expect(html).toContain('type="radio"')
    expect(html).toContain('mix-blend-mode')
    expect(html).toContain('--split')
    expect(html).toMatch(/<script>/)
    expect(html).not.toContain('<script src=')
  })

  it('does not invent GPU ms, histograms, or sliders when those fields are absent', () => {
    const html = formatHtmlReport(runtimeBase)
    expect(html).not.toMatch(/gpuFrameTimeMs/)
    expect(html).toContain('not measured on this device')
    expect(html).not.toContain('<h2>Frame-time histogram</h2>')
    expect(html).not.toContain('type="range"')
    expect(html).not.toContain('<h2>Score trend</h2>')
  })
})
