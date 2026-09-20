import { describe, it, expect } from 'vitest'
import { formatHtmlReport } from '../report/html.js'
import { metricLabel } from '../report/metric-labels.js'
import {
  badgeForMetric,
  formatVerdictStrip,
  type ReportJson,
} from '../report/verdict.js'

function report(partial: ReportJson): ReportJson {
  return {
    profile: 'game',
    mode: 'optimize',
    score: 80,
    ...partial,
  }
}

const stripExample: ReportJson = {
  baseline: {
    gpuFrameTimeMs: 100,
    triangles: 100_000,
    drawCalls: 140,
    avgFps: 30,
    p95FrameTimeMs: 40,
    lightCount: 2,
    shadowCastingLightCount: 1,
  },
  after: {
    gpuFrameTimeMs: 88,
    triangles: 23_000,
    drawCalls: 153,
    avgFps: 30,
    p95FrameTimeMs: 40,
    lightCount: 2,
    shadowCastingLightCount: 1,
  },
  claimed: {
    gpuFrameTimeMs: 'win',
    triangles: 'win',
    drawCalls: 'loss',
  },
  noiseBand: {
    gpuFrameTimeMs: { abs: 1, rel: 0.02 },
    triangles: { abs: 100, rel: 0.01 },
    drawCalls: { abs: 2, rel: 0.02 },
  },
  expectedTradeoffs: ['drawCalls'],
}

describe('metric labels', () => {
  it('maps known keys to labels with units', () => {
    expect(metricLabel('gpuFrameTimeMs')).toBe('GPU frame time (ms)')
    expect(metricLabel('p95FrameTimeMs')).toBe('p95 frame time (ms)')
    expect(metricLabel('avgFps')).toBe('Average FPS')
    expect(metricLabel('drawCalls')).toBe('Draw calls')
    expect(metricLabel('triangles')).toBe('Triangles')
    expect(metricLabel('lightCount')).toBe('Lights')
    expect(metricLabel('shadowCastingLightCount')).toBe('Shadow-casting lights')
    expect(metricLabel('drawingBufferPixels')).toBe('Drawing buffer (pixels)')
  })

  it('falls back to the raw key when the name is unknown', () => {
    expect(metricLabel('customHostMetric')).toBe('customHostMetric')
  })
})

describe('badge states', () => {
  it('labels a win outside the noise band as win', () => {
    expect(
      badgeForMetric(
        report({
          baseline: { triangles: 100_000 },
          after: { triangles: 21_000 },
          claimed: { triangles: 'win' },
        }),
        'triangles',
      ),
    ).toBe('win')
  })

  it('labels a regression outside the noise band as loss', () => {
    expect(
      badgeForMetric(
        report({
          baseline: { gpuFrameTimeMs: 8 },
          after: { gpuFrameTimeMs: 16 },
          claimed: { gpuFrameTimeMs: 'loss' },
        }),
        'gpuFrameTimeMs',
      ),
    ).toBe('loss')
  })

  it('labels a float wiggle inside the band as inside-noise', () => {
    expect(
      badgeForMetric(
        report({
          baseline: { avgFps: 30 },
          after: { avgFps: 30.4 },
          claimed: { avgFps: 'inside-noise' },
        }),
        'avgFps',
      ),
    ).toBe('inside-noise')
  })

  it('labels integer metrics with a zero delta as unchanged, not inside-noise', () => {
    const input = report({
      baseline: { lightCount: 2, triangles: 10_000, drawCalls: 40 },
      after: { lightCount: 2, triangles: 10_000, drawCalls: 40 },
      claimed: {
        lightCount: 'inside-noise',
        triangles: 'inside-noise',
        drawCalls: 'inside-noise',
      },
      noiseBand: {
        lightCount: { abs: 1, rel: 0.1 },
        triangles: { abs: 100, rel: 0.02 },
        drawCalls: { abs: 2, rel: 0.05 },
      },
    })
    expect(badgeForMetric(input, 'lightCount')).toBe('unchanged')
    expect(badgeForMetric(input, 'triangles')).toBe('unchanged')
    expect(badgeForMetric(input, 'drawCalls')).toBe('unchanged')
  })

  it('does not treat a zero-delta float as unchanged', () => {
    expect(
      badgeForMetric(
        report({
          baseline: { avgFps: 30 },
          after: { avgFps: 30 },
          claimed: { avgFps: 'inside-noise' },
        }),
        'avgFps',
      ),
    ).toBe('inside-noise')
  })

  it('labels a missing after value as not-measured', () => {
    expect(
      badgeForMetric(
        report({
          baseline: { gpuFrameTimeMs: 10, triangles: 100_000 },
          after: { triangles: 21_000 },
        }),
        'gpuFrameTimeMs',
      ),
    ).toBe('not-measured')
  })

  it('labels expectedTradeoffs as expected-trade-off even when claimed is loss', () => {
    expect(badgeForMetric(report(stripExample), 'drawCalls')).toBe('expected-trade-off')
    expect(badgeForMetric(report(stripExample), 'triangles')).toBe('win')
  })
})

describe('verdict strip', () => {
  it('builds one sentence from claims and expected trade-offs', () => {
    expect(formatVerdictStrip(report(stripExample))).toBe(
      'GPU -12% (outside noise) · triangles -77% · draw calls +13 (expected trade-off)',
    )
  })

  it('omits unmeasured metrics from the strip (partial data)', () => {
    expect(
      formatVerdictStrip(
        report({
          baseline: { triangles: 100_000, drawCalls: 140 },
          after: { triangles: 23_000 },
          claimed: { triangles: 'win' },
        }),
      ),
    ).toBe('triangles -77%')
  })

  it('omits unchanged and inside-noise from the strip', () => {
    expect(
      formatVerdictStrip(
        report({
          baseline: { triangles: 10_000, lightCount: 2, avgFps: 30 },
          after: { triangles: 10_000, lightCount: 2, avgFps: 30.2 },
          claimed: {
            triangles: 'inside-noise',
            lightCount: 'inside-noise',
            avgFps: 'inside-noise',
          },
        }),
      ),
    ).toBe('')
  })

  it('never describes an expected trade-off as a regression', () => {
    const sentence = formatVerdictStrip(report(stripExample))
    expect(sentence).toContain('draw calls +13 (expected trade-off)')
    expect(sentence).not.toMatch(/draw calls[^·]*loss/)
    expect(sentence).not.toMatch(/regression/i)
  })
})

describe('HTML report correctness (Part B)', () => {
  it('renders every badge state as a chip and never paints expected trade-offs red', () => {
    const html = formatHtmlReport(
      report({
        baseline: {
          gpuFrameTimeMs: 8,
          avgFps: 30,
          triangles: 10_000,
          drawCalls: 40,
          lightCount: 2,
        },
        after: {
          gpuFrameTimeMs: 16,
          avgFps: 30.3,
          triangles: 10_000,
          drawCalls: 53,
          lightCount: 2,
        },
        claimed: {
          gpuFrameTimeMs: 'loss',
          avgFps: 'inside-noise',
          triangles: 'inside-noise',
          drawCalls: 'loss',
        },
        expectedTradeoffs: ['drawCalls'],
        noiseBand: {
          gpuFrameTimeMs: { abs: 0.5, rel: 0.02 },
          avgFps: { abs: 1, rel: 0.05 },
          triangles: { abs: 50, rel: 0.02 },
          drawCalls: { abs: 1, rel: 0.02 },
        },
      }),
    )
    expect(html).toMatch(/class="verdict loss"[^>]*>loss/)
    expect(html).toMatch(/class="verdict inside-noise"[^>]*>inside-noise/)
    expect(html).toMatch(/class="verdict unchanged"[^>]*>unchanged/)
    expect(html).toMatch(/class="verdict expected-trade-off"[^>]*>expected trade-off/)
    expect(html).not.toMatch(/class="verdict loss"[^>]*>[\s\S]{0,40}expected/)
    const tradeCss = html.match(/\.verdict\.expected-trade-off\s*\{[^}]+\}/)?.[0] ?? ''
    expect(tradeCss).toMatch(/background/)
    expect(tradeCss).not.toMatch(/--loss|#7f1d1d|#fb7185/)
  })

  it('shows a not-measured chip when after omitted that metric', () => {
    const html = formatHtmlReport(
      report({
        baseline: { triangles: 100_000, gpuFrameTimeMs: 12 },
        after: { triangles: 21_000 },
        claimed: { triangles: 'win' },
      }),
    )
    expect(html).toMatch(/class="verdict not-measured"[^>]*>not measured/)
    expect(html).toContain('GPU frame time (ms)')
  })

  it('places the verdict strip under the header and groups cards into Cost and Scene facts', () => {
    const html = formatHtmlReport(report(stripExample))
    expect(html).toContain(
      'GPU -12% (outside noise) · triangles -77% · draw calls +13 (expected trade-off)',
    )
    expect(html).toMatch(/<h1>threejs-doctor report<\/h1>[\s\S]*verdict-strip[\s\S]*<h2>Cost<\/h2>/)
    expect(html).toContain('<h2>Cost</h2>')
    expect(html).toContain('<h2>Scene facts</h2>')
    expect(html).not.toContain('Before / after')
    const costIdx = html.indexOf('<h2>Cost</h2>')
    const sceneIdx = html.indexOf('<h2>Scene facts</h2>')
    const gpuIdx = html.indexOf('GPU frame time (ms)')
    const lightsIdx = html.indexOf('Shadow-casting lights')
    expect(costIdx).toBeGreaterThan(-1)
    expect(sceneIdx).toBeGreaterThan(costIdx)
    expect(gpuIdx).toBeGreaterThan(costIdx)
    expect(gpuIdx).toBeLessThan(sceneIdx)
    expect(lightsIdx).toBeGreaterThan(sceneIdx)
  })

  it('omits the verdict strip when nothing notable was measured', () => {
    const html = formatHtmlReport(
      report({
        staticScan: true,
        baseline: { lightCount: 2, drawCalls: 0, triangles: 0, avgFps: 0, p95FrameTimeMs: 0 },
      }),
    )
    expect(html).not.toContain('class="verdict-strip"')
  })
})
