import React, { createContext, useContext, useMemo, useState, useCallback } from 'react'
import type { Doctor, DoctorReport } from '@threejs-doctor/runtime'
import type { PassId } from '@threejs-doctor/core'

export interface DoctorContextValue {
  doctor: Doctor | null
  report: DoctorReport | null
  runDiagnose(): Promise<DoctorReport>
  runOptimize(apply?: Array<'safe' | PassId>): Promise<DoctorReport>
}

const DoctorContext = createContext<DoctorContextValue | null>(null)

export function DoctorProvider({
  doctor,
  children,
}: {
  doctor: Doctor
  children: React.ReactNode
}) {
  const [report, setReport] = useState<DoctorReport | null>(null)
  const runDiagnose = useCallback(async () => {
    const r = await doctor.diagnose()
    setReport(r)
    return r
  }, [doctor])
  const runOptimize = useCallback(
    async (apply: Array<'safe' | PassId> = ['safe']) => {
      const r = await doctor.optimize({ apply })
      setReport(r)
      return r
    },
    [doctor],
  )
  const value = useMemo(
    () => ({ doctor, report, runDiagnose, runOptimize }),
    [doctor, report, runDiagnose, runOptimize],
  )
  return React.createElement(DoctorContext.Provider, { value }, children)
}

export function useDoctor(): DoctorContextValue {
  const ctx = useContext(DoctorContext)
  if (!ctx) throw new Error('useDoctor must be used within DoctorCanvas / DoctorProvider')
  return ctx
}
