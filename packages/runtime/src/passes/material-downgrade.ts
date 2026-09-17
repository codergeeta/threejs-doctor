import type { OptimizePass } from './types.js'

export const materialDowngradePass: OptimizePass = {
  id: 'material-downgrade',
  apply(_ctx) {
    // Opt-in only: v1 records a no-op visual downgrade hook with empty rollback
    // so callers can include the pass id without mutating materials by default.
    return { rollback() {} }
  },
}
