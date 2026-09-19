import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const dist = resolve(process.cwd(), 'dist/attach.iife.js')

describe('committed live-attach IIFE', () => {
  it('ships a pasteable IIFE without invented FPS literals', () => {
    expect(existsSync(dist)).toBe(true)
    const text = readFileSync(dist, 'utf8')
    expect(text).toMatch(/ThreejsDoctorLiveAttach/)
    expect(text).toMatch(/attachQualityLadder/)
    expect(text).toMatch(/installRendererRenderCapture/)
    expect(text).toMatch(/wrapWebGLRendererCtor/)
    expect(text).toMatch(/PHONE_CLASS_PROBE/)
    expect(text).toMatch(/device: 'phone'|option === "phone"/)
    expect(text).toContain('WEBGL_debug_renderer_info')
    expect(text).not.toContain('62.5')
    expect(text).not.toMatch(/"avgFps"\s*:\s*3[0-9]/)
    expect(text).not.toContain('iamtechartist/ocean-simulation/blob')
  })

  it('matches a fresh esbuild of the current source', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'live-attach-')), 'attach.iife.js')
    execFileSync(process.execPath, ['scripts/build.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, LIVE_ATTACH_OUTFILE: out },
    })
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(dist, 'utf8'))
  })
})
