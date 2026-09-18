import { test, expect } from '@playwright/test'
import type { RealHostE2eReport } from '../src/main.ts'

async function report(page: import('@playwright/test').Page): Promise<RealHostE2eReport> {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.goto('/')
  await expect(page).toHaveTitle(/e2e ready/, { timeout: 30_000 })
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
  const data = await page.evaluate(() => window.__R2)
  expect(data).toBeTruthy()
  return data as RealHostE2eReport
}

test('GPU sampler constructs on WebGL2 context methods, never invents gpuFrameTimeMs', async ({ page }) => {
  const r = await report(page)
  expect(r.webgl2).toBe(true)
  expect(r.glHasCreateQuery).toBe(true)
  expect(r.extHasCreateQuery).toBe(false)
  if (r.extPresent) {
    expect(r.samplerConstructed).toBe(true)
  }
  if (r.samplerConstructed !== true) {
    expect(r.gpuFrameTimeMsPresent).toBe(false)
  }
})

test('composer-resolution-mismatch fires after a renderer DPR change', async ({ page }) => {
  const r = await report(page)
  expect(r.composerMismatchAfterDpr).toBe(true)
})

test('InstancedMesh world radius matches computeBoundingSphere()', async ({ page }) => {
  const r = await report(page)
  expect(r.computeBoundingSphereRadius).toBeGreaterThan(1)
  expect(r.computeBoundingSphereRadius).toBeGreaterThan(r.geometrySphereRadius * 10)
  expect(r.instancedWorldRadius).toBeCloseTo(r.computeBoundingSphereRadius, 5)
  expect(r.instancedWorldRadius).not.toBeCloseTo(r.geometrySphereRadius, 1)
})

test('drawn triangle cost drops after chunking even if unused geometry remains', async ({ page }) => {
  const r = await report(page)
  expect(r.geometryTrianglesAfter).toBeGreaterThan(r.geometryTrianglesBefore)
  expect(r.drawnTrianglesAfter).toBeLessThan(r.drawnTrianglesBefore)
})
