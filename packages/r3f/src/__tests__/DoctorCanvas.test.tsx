import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

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
    Canvas: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="r3f-canvas">{children}</div>
    ),
    useThree: () => three,
  }
})

import { DoctorCanvas } from '../DoctorCanvas.js'

describe('DoctorCanvas', () => {
  it('renders children inside canvas wrapper', () => {
    render(
      <DoctorCanvas profile="product">
        <div>hero</div>
      </DoctorCanvas>,
    )
    expect(screen.getByTestId('r3f-canvas')).toBeTruthy()
    expect(screen.getByText('hero')).toBeTruthy()
  })

  it('accepts composer and onPixelRatioChange props', () => {
    const composer = {
      isEffectComposer: true,
      passes: [],
      inputBuffer: { width: 8, height: 8 },
      outputBuffer: { width: 8, height: 8 },
    }
    render(
      <DoctorCanvas profile="game" composer={composer} onPixelRatioChange={() => {}}>
        <div>fx</div>
      </DoctorCanvas>,
    )
    expect(screen.getByText('fx')).toBeTruthy()
  })
})
