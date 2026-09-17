import React, { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree, type CanvasProps } from '@react-three/fiber'
import { Doctor } from '@threejs-doctor/runtime'
import type { Mode, Profile } from '@threejs-doctor/core'
import { DoctorProvider } from './useDoctor.js'

export interface DoctorCanvasProps extends Omit<CanvasProps, 'children'> {
  profile?: Profile
  mode?: Mode
  showOverlay?: boolean
  children?: React.ReactNode
}

function DoctorBridge({
  profile,
  mode,
  showOverlay,
  children,
}: {
  profile: Profile
  mode: Mode
  showOverlay: boolean
  children?: React.ReactNode
}) {
  const { scene, camera, gl } = useThree()
  const [doctor, setDoctor] = useState<Doctor | null>(null)

  const rendererLike = useMemo(
    () => ({
      info: gl.info,
      pixelRatio: typeof gl.getPixelRatio === 'function' ? gl.getPixelRatio() : 1,
      antialias: true,
      setPixelRatio: (v: number) => gl.setPixelRatio(v),
    }),
    [gl],
  )

  useEffect(() => {
    const d = new Doctor({
      scene: scene as never,
      camera,
      renderer: rendererLike as never,
      profile,
      mode,
    })
    setDoctor(d)
    if (showOverlay) d.mountOverlay()
    return () => {
      d.unmountOverlay()
    }
  }, [scene, camera, rendererLike, profile, mode, showOverlay])

  if (!doctor) return null
  return <DoctorProvider doctor={doctor}>{children}</DoctorProvider>
}

export function DoctorCanvas({
  profile = 'auto',
  mode = 'diagnose',
  showOverlay = false,
  children,
  ...canvasProps
}: DoctorCanvasProps) {
  return (
    <Canvas {...canvasProps}>
      <DoctorBridge profile={profile} mode={mode} showOverlay={showOverlay}>
        {children}
      </DoctorBridge>
    </Canvas>
  )
}
