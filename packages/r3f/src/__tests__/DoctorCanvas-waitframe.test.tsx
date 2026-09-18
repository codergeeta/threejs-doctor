import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'

const { constructed } = vi.hoisted(() => ({
  constructed: [] as Array<{ waitFrame?: unknown }>,
}))

vi.mock('@react-three/fiber', () => {
  const three = {
    scene: { children: [], traverse() {} },
    camera: {},
    gl: {
      info: { render: { calls: 1, triangles: 10 }, memory: { geometries: 1, textures: 1 } },
      getPixelRatio: () => 1,
      setPixelRatio() {},
      pixelRatio: 1,
    },
  }
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    useThree: () => three,
  }
})

vi.mock('@threejs-doctor/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@threejs-doctor/runtime')>()
  return {
    ...actual,
    Doctor: class extends actual.Doctor {
      constructor(opts: ConstructorParameters<typeof actual.Doctor>[0]) {
        constructed.push(opts)
        super(opts)
      }
    },
  }
})

import { DoctorCanvas } from '../DoctorCanvas.js'

describe('DoctorCanvas waitFrame', () => {
  it('passes a waitFrame hook so GPU queries can complete on the default r3f path', () => {
    constructed.length = 0
    render(
      <DoctorCanvas profile="game">
        <div>scene</div>
      </DoctorCanvas>,
    )
    expect(constructed.length).toBeGreaterThan(0)
    expect(typeof constructed[0]?.waitFrame).toBe('function')
  })
})
