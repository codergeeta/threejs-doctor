import { describe, it, expect } from 'vitest'
import { readRenderFrame, waitLiveFrame } from '../wait-frame.js'

describe('waitLiveFrame', () => {
  it('resolves when info.render.frame advances', async () => {
    const renderer = { info: { render: { frame: 4 } } }
    const queued: Array<() => void> = []
    const pending = waitLiveFrame(renderer, (cb) => {
      queued.push(cb)
    })()
    expect(queued).toHaveLength(1)
    renderer.info.render.frame = 5
    queued[0]!()
    await pending
    expect(readRenderFrame(renderer)).toBe(5)
  })

  it('gives up after maxTicks if the host frame never advances', async () => {
    const renderer = { info: { render: { frame: 1 } } }
    const queued: Array<() => void> = []
    const pending = waitLiveFrame(
      renderer,
      (cb) => {
        queued.push(cb)
      },
      2,
    )()
    queued.shift()!()
    queued.shift()!()
    await pending
  })

  it('falls back to the scheduler when frame is absent', async () => {
    const queued: Array<() => void> = []
    const pending = waitLiveFrame({}, (cb) => {
      queued.push(cb)
    })()
    expect(queued).toHaveLength(1)
    queued[0]!()
    await pending
  })
})
