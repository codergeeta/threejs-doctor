import { describe, it, expect } from 'vitest'
import { getLowEndBudget } from '../budgets.js'

describe('getLowEndBudget', () => {
  it('keeps draw-call targets in the 50–100 band for marketing/product', () => {
    expect(getLowEndBudget('marketing').maxDrawCalls).toBeGreaterThanOrEqual(50)
    expect(getLowEndBudget('marketing').maxDrawCalls).toBeLessThanOrEqual(100)
    expect(getLowEndBudget('product').maxDrawCalls).toBeLessThanOrEqual(100)
    expect(getLowEndBudget('marketing').maxDpr).toBe(1)
  })

  it('caps game and cad draw calls at 100 with DPR 1', () => {
    expect(getLowEndBudget('game').maxDrawCalls).toBeLessThanOrEqual(100)
    expect(getLowEndBudget('cad').maxDrawCalls).toBeLessThanOrEqual(100)
    expect(getLowEndBudget('game').maxDpr).toBe(1)
    expect(getLowEndBudget('cad').maxDpr).toBe(1)
  })
})
