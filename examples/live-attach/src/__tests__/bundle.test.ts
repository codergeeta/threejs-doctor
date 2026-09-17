import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve(process.cwd(), 'dist/attach.iife.js')

describe('committed live-attach IIFE', () => {
  it('ships a pasteable IIFE without invented FPS literals', () => {
    expect(existsSync(dist)).toBe(true)
    const text = readFileSync(dist, 'utf8')
    expect(text).toMatch(/ThreejsDoctorLiveAttach/)
    expect(text).toMatch(/attachQualityLadder/)
    expect(text).not.toContain('62.5')
    expect(text).not.toMatch(/"avgFps"\s*:\s*3[0-9]/)
    expect(text).not.toContain('iamtechartist/ocean-simulation/blob')
  })
})
