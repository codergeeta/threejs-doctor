import { describe, it, expect } from 'vitest'
import {
  attestationsMissing,
  shouldCheckPublishedRegistry,
} from '../../../../scripts/check-provenance.mjs'

describe('provenance attestation check', () => {
  it('treats empty or missing dist.attestations as a failure', () => {
    expect(attestationsMissing(undefined)).toBe(true)
    expect(attestationsMissing(null)).toBe(true)
    expect(attestationsMissing([])).toBe(true)
    expect(attestationsMissing({})).toBe(true)
    expect(attestationsMissing({ url: 'https://example.test/attest' })).toBe(false)
    expect(attestationsMissing([{ predicateType: 'https://slsa.dev/provenance/v1' }])).toBe(false)
  })

  it('does not hit the registry for dry-runs or default local invocation', () => {
    expect(shouldCheckPublishedRegistry([])).toBe(false)
    expect(shouldCheckPublishedRegistry(['--dry-run'])).toBe(false)
    expect(shouldCheckPublishedRegistry(['--published'])).toBe(true)
  })
})
