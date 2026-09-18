import { describe, it, expect } from 'vitest'
import { classifyMeasureValidity } from '../index.js'

describe('classifyMeasureValidity', () => {
  it('marks a run invalid when the page is hidden', () => {
    const result = classifyMeasureValidity({
      visibilityState: 'hidden',
      frameTimesMs: [16, 16, 17],
    })
    expect(result.invalid).toBe(true)
    expect(result.reason).toMatch(/hidden/i)
  })

  it('marks a run invalid when rAF gaps are clearly throttled', () => {
    const result = classifyMeasureValidity({
      visibilityState: 'visible',
      frameTimesMs: [16, 17, 1000, 16, 1100],
    })
    expect(result.invalid).toBe(true)
    expect(result.reason).toMatch(/throttl/i)
  })

  it('leaves a 16ms live-looking window valid', () => {
    const result = classifyMeasureValidity({
      visibilityState: 'visible',
      frameTimesMs: [16, 17, 15, 16, 18],
    })
    expect(result.invalid).toBe(false)
    expect(result.reason).toBeUndefined()
  })
})
