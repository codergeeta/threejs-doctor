import { describe, it, expect } from 'vitest'
import { runAllBenchSuites, runBenchSuite, fixtures } from '../index.js'

describe('bench harness', () => {
  it('exposes four profile fixtures', () => {
    expect(Object.keys(fixtures).sort()).toEqual(['cad', 'game', 'marketing', 'product'])
  })

  it('runs measure/optimize loop and returns before/after for marketing', async () => {
    const report = await runBenchSuite({ profile: 'marketing', budget: 'low' })
    expect(report.mode).toBe('benchmark')
    expect(report.baseline.drawCalls).toBeGreaterThan(0)
    expect(report.after).toBeDefined()
    expect(report.deltas).toBeDefined()
    expect(report.incomplete).toBe(false)
    expect(report.appliedPasses.length).toBeGreaterThan(0)
  })

  it('produces complete before/after reports for all four profiles', async () => {
    const reports = await runAllBenchSuites()
    expect(Object.keys(reports).sort()).toEqual(['cad', 'game', 'marketing', 'product'])
    for (const [profile, report] of Object.entries(reports)) {
      expect(report.profile).toBe(profile)
      expect(report.mode).toBe('benchmark')
      expect(report.incomplete).toBe(false)
      expect(report.baseline.drawCalls).toBeGreaterThan(0)
      expect(report.after).toBeDefined()
      expect(report.deltas).toBeDefined()
      expect(report.appliedPasses.length).toBeGreaterThan(0)
    }
  })
})
