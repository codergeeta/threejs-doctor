import { describe, it, expect } from 'vitest'
import { pixelChangedRatio, classifyVisualSafety } from '../index.js'

function rgba(width: number, height: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = fill[0]
    out[i + 1] = fill[1]
    out[i + 2] = fill[2]
    out[i + 3] = fill[3]
  }
  return out
}

describe('pixelChangedRatio', () => {
  it('is ~0 for identical buffers (control render twice)', () => {
    const a = rgba(4, 4, [10, 20, 30, 255])
    const b = rgba(4, 4, [10, 20, 30, 255])
    expect(pixelChangedRatio(a, b)).toBe(0)
  })

  it('reports the fraction of pixels that exceed the per-channel threshold', () => {
    const a = rgba(2, 2, [0, 0, 0, 255])
    const b = rgba(2, 2, [0, 0, 0, 255])
    b[0] = 40
    b[1] = 40
    b[2] = 40
    expect(pixelChangedRatio(a, b, 8)).toBe(0.25)
  })
})

describe('classifyVisualSafety', () => {
  it('does not label a pass safe when candidate diff exceeds control + threshold', () => {
    const verdict = classifyVisualSafety({
      controlChangedRatio: 0.002,
      candidateChangedRatio: 0.2,
      maxChangedRatio: 0.02,
    })
    expect(verdict.safe).toBe(false)
    expect(verdict.visualDelta).toBe(true)
  })

  it('does not label a pass safe at the old 2% pixel floor; default is 0.5%', () => {
    const verdict = classifyVisualSafety({
      controlChangedRatio: 0,
      candidateChangedRatio: 0.02,
    })
    expect(verdict.safe).toBe(false)
    expect(verdict.visualDelta).toBe(true)
  })

  it('keeps a pass eligible when candidate stays within control noise', () => {
    const verdict = classifyVisualSafety({
      controlChangedRatio: 0.01,
      candidateChangedRatio: 0.012,
      maxChangedRatio: 0.05,
    })
    expect(verdict.safe).toBe(true)
    expect(verdict.visualDelta).toBe(false)
  })
})
