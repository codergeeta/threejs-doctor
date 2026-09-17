import type { DoctorReport } from '@threejs-doctor/runtime'

export function formatJsonReport(report: DoctorReport): string {
  return JSON.stringify(report, null, 2)
}
