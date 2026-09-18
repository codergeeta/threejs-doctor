import type { CliArgs } from '../cli.js'
import type { DoctorReport } from '@threejs-doctor/runtime'

export const SCAN_NOT_IMPLEMENTED =
  'not implemented: threejs-doctor scan/ci is not a working gate. Static scan is a stub and must not be used as a score gate. Attach the runtime Doctor to a live Three.js scene until a real scanner exists.'

export class ScanNotImplementedError extends Error {
  readonly code = 'SCAN_NOT_IMPLEMENTED'
  constructor(message = SCAN_NOT_IMPLEMENTED) {
    super(message)
    this.name = 'ScanNotImplementedError'
  }
}

/** Static project scan is not implemented. Live scene attach is the runtime API. */
export async function runScan(_args: CliArgs): Promise<DoctorReport> {
  throw new ScanNotImplementedError()
}
