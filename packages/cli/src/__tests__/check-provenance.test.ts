import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  attestationsMissing,
  shouldCheckPublishedRegistry,
  shouldUseLatestPublishedVersion,
  resolvePublishedVersion,
  isRetryableProvenanceLookupFailure,
  PROVENANCE_RETRY_DELAYS_MS,
  collectPublishedAttestationFailures,
  main,
} from '../../../../scripts/check-provenance.mjs'

const present = { url: 'https://example.test/attestations/pkg@1.0.0' }

function e404(spec = 'threejs-doctor@0.1.4') {
  return new Error(
    `npm view ${spec} dist.attestations failed: Command failed: npm view ${spec} dist.attestations --json\n` +
      'npm error code E404\n' +
      `npm error 404 No match found for version ${spec.split('@').pop()}\n` +
      `npm error 404  '${spec}' is not in this registry.`,
  )
}

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

  it('uses --latest to check the version currently on npm, not the local package.json', () => {
    expect(shouldUseLatestPublishedVersion(['--published'])).toBe(false)
    expect(shouldUseLatestPublishedVersion(['--published', '--latest'])).toBe(true)
    expect(resolvePublishedVersion('0.1.4', ['--published'], '0.1.3')).toBe('0.1.4')
    expect(resolvePublishedVersion('0.1.4', ['--published', '--latest'], '0.1.3')).toBe('0.1.3')
  })

  it('retries E404 / empty dist.attestations after publish, not auth failures', () => {
    expect(isRetryableProvenanceLookupFailure(e404())).toBe(true)
    expect(isRetryableProvenanceLookupFailure(new Error('404 No match found for version 0.1.4'))).toBe(
      true,
    )
    expect(isRetryableProvenanceLookupFailure(new Error('npm error code E401'))).toBe(false)
    expect(isRetryableProvenanceLookupFailure(new Error('ENOTFOUND registry.npmjs.org'))).toBe(false)
  })

  // 0.1.5: publish.yml run 35489954729 published all seven packages, then
  // check-provenance --published went red after 6 retries (~2–3 min) because
  // @threejs-doctor/cli@0.1.5 was still E404. Minutes later every package had
  // non-empty dist.attestations. Scoped npm indexing can lag the unscoped
  // tarball; wait ~5–8 min before the hard fail. Do not republish.
  it('backs off for about 5–8 minutes before failing the post-publish check', () => {
    const total = PROVENANCE_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0)
    expect(PROVENANCE_RETRY_DELAYS_MS.length).toBeGreaterThanOrEqual(7)
    expect(total).toBeGreaterThanOrEqual(300_000)
    expect(total).toBeLessThanOrEqual(480_000)
  })

  it('retries when the version is not indexed yet, then succeeds', async () => {
    const packages = [{ name: 'threejs-doctor', version: '0.1.4' }]
    let calls = 0
    const sleeps: number[] = []
    const failures = await collectPublishedAttestationFailures({
      packages,
      viewAttestations: () => {
        calls += 1
        if (calls < 3) throw e404()
        return present
      },
      delaysMs: [5, 10, 20],
      sleep: async (ms: number) => {
        sleeps.push(ms)
      },
      log: () => {},
    })
    expect(failures).toEqual([])
    expect(calls).toBe(3)
    expect(sleeps).toEqual([5, 10])
  })

  it('retries empty dist.attestations until they appear', async () => {
    const packages = [
      { name: 'threejs-doctor', version: '0.1.4' },
      { name: '@threejs-doctor/cli', version: '0.1.4' },
    ]
    let round = 0
    const failures = await collectPublishedAttestationFailures({
      packages,
      viewAttestations: (name: string) => {
        if (round === 0 && name === 'threejs-doctor') return []
        return present
      },
      delaysMs: [1, 1],
      sleep: async () => {
        round += 1
      },
      log: () => {},
    })
    expect(failures).toEqual([])
    expect(round).toBe(1)
  })

  it('fails hard when attestations stay empty after retries', async () => {
    const failures = await collectPublishedAttestationFailures({
      packages: [{ name: 'threejs-doctor', version: '0.1.4' }],
      viewAttestations: () => [],
      delaysMs: [1, 1],
      sleep: async () => {},
      log: () => {},
    })
    expect(failures.map((f: { spec: string }) => f.spec)).toEqual(['threejs-doctor@0.1.4'])
  })

  it('fails hard when E404 persists after retries', async () => {
    const failures = await collectPublishedAttestationFailures({
      packages: [{ name: 'threejs-doctor', version: '0.1.4' }],
      viewAttestations: () => {
        throw e404()
      },
      delaysMs: [1],
      sleep: async () => {},
      log: () => {},
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].spec).toBe('threejs-doctor@0.1.4')
  })

  it('does not retry non-404 registry errors', async () => {
    await expect(
      collectPublishedAttestationFailures({
        packages: [{ name: 'threejs-doctor', version: '0.1.4' }],
        viewAttestations: () => {
          throw new Error('npm error code E401')
        },
        delaysMs: [1, 1],
        sleep: async () => {
          throw new Error('should not sleep')
        },
        log: () => {},
      }),
    ).rejects.toThrow(/E401/)
  })

  it('main --published retries a post-publish E404 then passes', async () => {
    let calls = 0
    const code = await main(['--published'], {
      viewAttestations: () => {
        calls += 1
        if (calls === 1) throw e404()
        return present
      },
      delaysMs: [1],
      sleep: async () => {},
      log: () => {},
    })
    expect(code).toBe(0)
    expect(calls).toBeGreaterThan(1)
  })

  it('main --published still fails when attestations stay empty', async () => {
    await expect(
      main(['--published'], {
        viewAttestations: () => [],
        delaysMs: [1],
        sleep: async () => {},
        log: () => {},
      }),
    ).rejects.toThrow(/Provenance attestations missing/)
  })

  it('publish.yml still runs the published provenance check after npm publish', () => {
    const yml = readFileSync(resolve(process.cwd(), '../../.github/workflows/publish.yml'), 'utf8')
    expect(yml).toContain('node scripts/check-provenance.mjs --published')
    expect(yml).toMatch(/~5–8 min/)
  })
})
