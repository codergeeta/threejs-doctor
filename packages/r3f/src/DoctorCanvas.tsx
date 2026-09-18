import React, { useEffect, useState } from 'react'
import { Canvas, useThree, type CanvasProps } from '@react-three/fiber'
import { Doctor } from '@threejs-doctor/runtime'
import type { Mode, Profile } from '@threejs-doctor/core'
import { DoctorProvider } from './useDoctor.js'

export interface DoctorCanvasProps extends Omit<CanvasProps, 'children'> {
  profile?: Profile
  mode?: Mode
  showOverlay?: boolean
  children?: React.ReactNode
  composer?: unknown
  onPixelRatioChange?: (ratio: number) => void
}

function DoctorBridge({
  profile,
  mode,
  showOverlay,
  composer,
  onPixelRatioChange,
  children,
}: {
  profile: Profile
  mode: Mode
  showOverlay: boolean
  composer?: unknown
  onPixelRatioChange?: (ratio: number) => void
  children?: React.ReactNode
}) {
  const { scene, camera, gl } = useThree()
  const [doctor, setDoctor] = useState<Doctor | null>(null)

  useEffect(() => {
    const d = new Doctor({
      scene: scene as never,
      camera,
      renderer: gl as never,
      hostRenderer: gl as never,
      profile,
      mode,
      ...(composer !== undefined ? { composer } : {}),
      ...(onPixelRatioChange ? { onPixelRatioChange } : {}),
    })
    setDoctor(d)
    if (showOverlay) d.mountOverlay()
    return () => {
      d.unmountOverlay()
    }
  }, [scene, camera, gl, profile, mode, showOverlay, composer, onPixelRatioChange])

  if (!doctor) return null
  return <DoctorProvider doctor={doctor}>{children}</DoctorProvider>
}

export function DoctorCanvas({
  profile = 'auto',
  mode = 'diagnose',
  showOverlay = false,
  composer,
  onPixelRatioChange,
  children,
  ...canvasProps
}: DoctorCanvasProps) {
  return (
    <Canvas {...canvasProps}>
      <DoctorBridge
        profile={profile}
        mode={mode}
        showOverlay={showOverlay}
        {...(composer !== undefined ? { composer } : {})}
        {...(onPixelRatioChange ? { onPixelRatioChange } : {})}
      >
        {children}
      </DoctorBridge>
    </Canvas>
  )
}
