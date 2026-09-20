import { metricLabel } from './metric-labels.js'
import {
  asNumber,
  badgeForMetric,
  BADGE_LABEL,
  COST_METRICS,
  formatVerdictStrip,
  isRecord,
  SCENE_FACT_METRICS,
  type JsonMap,
} from './verdict.js'

export interface HtmlReportOptions {
  repoUrl?: string
  ref?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function githubBlobUrl(
  repoUrl: string | undefined,
  file: string,
  line: number | undefined,
  ref: string,
): string | undefined {
  if (!repoUrl) return undefined
  const cleaned = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '')
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/i.test(cleaned)) return undefined
  const path = file.replace(/\\/g, '/')
  const suffix = line !== undefined ? `#L${line}` : ''
  return `${cleaned}/blob/${ref}/${path}${suffix}`
}

function scoreKind(input: JsonMap): 'static (source patterns)' | 'runtime (measured)' {
  if (input.staticScan === true) return 'static (source patterns)'
  return 'runtime (measured)'
}

function fileLine(finding: JsonMap): Array<{ file: string; line?: number }> {
  const locations = finding.locations
  if (Array.isArray(locations) && locations.length > 0) {
    return locations.flatMap((loc) => {
      if (!isRecord(loc)) return []
      const file = asString(loc.file)
      if (!file) return []
      const line = asNumber(loc.line)
      return line === undefined ? [{ file }] : [{ file, line }]
    })
  }
  const evidence = isRecord(finding.evidence) ? finding.evidence : undefined
  const file = evidence ? asString(evidence.file) : undefined
  if (!file) return []
  const line = evidence ? asNumber(evidence.line) : undefined
  return line === undefined ? [{ file }] : [{ file, line }]
}

function expensiveMeshes(input: JsonMap): Array<{ label: string; triangles?: number }> {
  const direct = input.expensiveMeshes ?? input.topMeshes
  if (Array.isArray(direct)) {
    return direct.flatMap((item) => {
      if (!isRecord(item)) return []
      const name = asString(item.name) ?? asString(item.id) ?? asString(item.label)
      const triangles = asNumber(item.triangles) ?? asNumber(item.drawnTriangles)
      if (!name && triangles === undefined) return []
      const label = name ?? 'mesh'
      return triangles === undefined ? [{ label }] : [{ label, triangles }]
    })
  }
  const summary =
    asString(input.triangleContributorSummary) ??
    (isRecord(input.baseline) ? asString(input.baseline.triangleContributorSummary) : undefined)
  if (summary && summary.includes(':')) {
    const idx = summary.lastIndexOf(':')
    const name = summary.slice(0, idx)
    const triangles = Number(summary.slice(idx + 1))
    return Number.isFinite(triangles) ? [{ label: name, triangles }] : [{ label: name }]
  }
  const findings = Array.isArray(input.findings) ? input.findings : []
  for (const finding of findings) {
    if (!isRecord(finding)) continue
    const evidence = isRecord(finding.evidence) ? finding.evidence : undefined
    const top = evidence ? asString(evidence.topContributor) : undefined
    if (top && top.includes(':')) {
      const idx = top.lastIndexOf(':')
      const name = top.slice(0, idx)
      const triangles = Number(top.slice(idx + 1))
      return Number.isFinite(triangles) ? [{ label: name, triangles }] : [{ label: name }]
    }
  }
  return []
}

function gpuPassRows(input: JsonMap): Array<{ pass: string; ms: number }> | undefined {
  const raw = input.gpuPassTimes ?? input.passGpuMs
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const rows: Array<{ pass: string; ms: number }> = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const pass = asString(item.pass) ?? asString(item.id) ?? asString(item.name)
    const ms = asNumber(item.gpuFrameTimeMs) ?? asNumber(item.ms) ?? asNumber(item.gpuMs)
    if (!pass || ms === undefined) continue
    rows.push({ pass, ms })
  }
  return rows.length > 0 ? rows : undefined
}

function captures(input: JsonMap): Array<{ label: string; dataUrl: string }> {
  const raw = input.captures ?? input.visuals ?? input.screenshots
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!isRecord(item)) return []
    const dataUrl = asString(item.dataUrl) ?? asString(item.src)
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return []
    return [{ label: asString(item.label) ?? 'capture', dataUrl }]
  })
}

function historyPoints(input: JsonMap): Array<{ label: string; score: number }> {
  const raw = input.history
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!isRecord(item)) return []
    const score = asNumber(item.score)
    if (score === undefined) return []
    const label = asString(item.commit) ?? asString(item.label) ?? String(score)
    return [{ label, score }]
  })
}

function verdictChip(input: JsonMap, key: string, afterVal: number | undefined, hasAfter: boolean): string {
  const badge = badgeForMetric(input, key)
  if (badge) {
    return `<span class="verdict ${escapeHtml(badge)}">${escapeHtml(BADGE_LABEL[badge])}</span>`
  }
  if (hasAfter && afterVal !== undefined) {
    return '<span class="verdict none">no noise band</span>'
  }
  return ''
}

function cardsForKeys(input: JsonMap, keys: readonly string[]): string {
  const baseline = isRecord(input.baseline) ? input.baseline : undefined
  const after = isRecord(input.after) ? input.after : undefined
  if (!baseline) return ''
  const cards: string[] = []
  for (const key of keys) {
    const beforeVal = asNumber(baseline[key])
    if (beforeVal === undefined) continue
    const afterVal = after ? asNumber(after[key]) : undefined
    const verdictHtml = verdictChip(input, key, afterVal, after !== undefined)
    cards.push(`<article class="card">
      <h3>${escapeHtml(metricLabel(key))}</h3>
      <p class="pair">${escapeHtml(String(beforeVal))}${
        afterVal === undefined ? '' : ` → ${escapeHtml(String(afterVal))}`
      }</p>
      ${verdictHtml}
    </article>`)
  }
  return cards.join('')
}

function metricCards(input: JsonMap): string {
  const cost = cardsForKeys(input, COST_METRICS)
  const scene = cardsForKeys(input, SCENE_FACT_METRICS)
  const parts: string[] = []
  if (cost) {
    parts.push(`<section><h2>Cost</h2><div class="grid">${cost}</div>
    <p class="note">Verdicts use the report noise band (max half-range, 1.4826 × MAD). Missing bands are not scored as wins. Integer metrics with a zero delta are unchanged, not inside-noise.</p>
  </section>`)
  }
  if (scene) {
    parts.push(`<section><h2>Scene facts</h2><div class="grid">${scene}</div></section>`)
  }
  return parts.join('')
}

function findingsSection(input: JsonMap, options: HtmlReportOptions): string {
  const findings = Array.isArray(input.findings) ? input.findings : []
  if (findings.length === 0) {
    return '<section><h2>Findings</h2><p>None.</p></section>'
  }
  const ref = options.ref ?? 'main'
  const items = findings.flatMap((finding) => {
    if (!isRecord(finding)) return []
    const id = asString(finding.id) ?? 'finding'
    const severity = asString(finding.severity) ?? 'warn'
    const message = asString(finding.message) ?? ''
    const fix = asString(finding.suggestedFix)
    const sites = fileLine(finding)
    const siteHtml =
      sites.length === 0
        ? ''
        : `<ul class="sites">${sites
            .map((site) => {
              const label =
                site.line === undefined ? site.file : `${site.file}:${site.line}`
              const href = githubBlobUrl(options.repoUrl, site.file, site.line, ref)
              return href
                ? `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`
                : `<li>${escapeHtml(label)}</li>`
            })
            .join('')}</ul>`
    const fixHtml = fix
      ? `<pre class="fix">${escapeHtml(fix)}</pre>`
      : ''
    return [`<article class="finding ${escapeHtml(severity)}">
      <h3><span class="sev">${escapeHtml(severity)}</span> ${escapeHtml(id)}</h3>
      <p>${escapeHtml(message)}</p>
      ${siteHtml}
      ${fixHtml}
    </article>`]
  })
  return `<section><h2>Findings</h2>${items.join('')}</section>`
}

function meshesSection(input: JsonMap): string {
  const meshes = expensiveMeshes(input)
  if (meshes.length === 0) return ''
  const rows = meshes
    .map((mesh) => {
      const tri =
        mesh.triangles === undefined ? 'not measured' : escapeHtml(String(mesh.triangles))
      return `<tr><td>${escapeHtml(mesh.label)}</td><td>${tri}</td></tr>`
    })
    .join('')
  return `<section><h2>Expensive meshes (drawn triangles)</h2>
    <table><thead><tr><th>Mesh</th><th>Triangles</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`
}

function gpuSection(input: JsonMap): string {
  const rows = gpuPassRows(input)
  const baseline = isRecord(input.baseline) ? input.baseline : undefined
  const frameGpu = baseline ? asNumber(baseline.gpuFrameTimeMs) : undefined
  if (rows) {
    const body = rows
      .map((row) => `<tr><td>${escapeHtml(row.pass)}</td><td>${escapeHtml(String(row.ms))}</td></tr>`)
      .join('')
    return `<section><h2>GPU time per pass</h2>
      <table><thead><tr><th>Pass</th><th>ms</th></tr></thead><tbody>${body}</tbody></table>
    </section>`
  }
  if (frameGpu !== undefined) {
    return `<section><h2>GPU time</h2><p>Frame GPU ${escapeHtml(String(frameGpu))} ms (no per-pass breakdown in this report).</p></section>`
  }
  return `<section><h2>GPU time per pass</h2><p>not measured on this device</p>
      <p class="note">GPU ms need EXT_disjoint_timer_query_webgl2. That extension is often missing on iOS Safari and many mobile browsers.</p>
    </section>`
}

function visualsSection(input: JsonMap): string {
  const shots = captures(input)
  if (shots.length === 0) return ''
  const figs = shots
    .map(
      (shot) =>
        `<figure><img alt="${escapeHtml(shot.label)}" src="${escapeHtml(shot.dataUrl)}"/><figcaption>${escapeHtml(shot.label)}</figcaption></figure>`,
    )
    .join('')
  return `<section><h2>Visuals</h2><div class="shots">${figs}</div></section>`
}

function trendSection(input: JsonMap): string {
  const points = historyPoints(input)
  if (points.length < 2) return ''
  const scores = points.map((p) => p.score)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 100)
  const span = Math.max(1, max - min)
  const w = 480
  const h = 120
  const poly = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (w - 16) + 8
      const y = h - 12 - ((p.score - min) / span) * (h - 24)
      return `${x},${y}`
    })
    .join(' ')
  const labels = points.map((p) => escapeHtml(p.label)).join(' → ')
  return `<section><h2>Score trend</h2>
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Score history ${labels}">
      <polyline fill="none" stroke="#7dd3fc" stroke-width="3" points="${poly}"/>
    </svg>
    <p class="note">${labels}</p>
  </section>`
}

const CSS = `
:root { color-scheme: dark; --bg:#0b1220; --fg:#e8eef9; --muted:#9db0c9; --card:#152238; --line:#2a3d5c; --win:#4ade80; --loss:#fb7185; --noise:#fbbf24; }
* { box-sizing: border-box; }
body { margin:0; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--fg); }
main { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
h1 { font-size: 1.6rem; margin: 0 0 8px; }
h2 { font-size: 1.15rem; margin: 28px 0 12px; }
h3 { font-size: 0.95rem; margin: 0 0 6px; }
.muted { color: var(--muted); }
.grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:12px; }
.card, .finding { background: var(--card); border:1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin: 0 0 10px; }
.pair { font-variant-numeric: tabular-nums; margin: 0; }
.verdict { display:inline-block; margin-top:8px; padding:2px 8px; border-radius: 999px; font-size: 12px; }
.verdict-strip { font-variant-numeric: tabular-nums; margin: 8px 0 16px; }
.verdict.win { background:#14532d; color:var(--win); }
.verdict.loss { background:#7f1d1d; color:var(--loss); }
.verdict.inside-noise { background:#78350f; color:var(--noise); }
.verdict.unchanged, .verdict.not-measured, .verdict.none { background:#1e293b; color:var(--muted); }
.verdict.expected-trade-off { background:#1e3a5f; color:#93c5fd; }
.sev { text-transform: uppercase; font-size: 11px; letter-spacing: .04em; }
.finding.error { border-color: #fb7185; }
.finding.warn { border-color: #fbbf24; }
.sites { margin: 8px 0; padding-left: 18px; }
.fix { background:#0b1220; border:1px solid var(--line); padding:10px; overflow:auto; white-space: pre-wrap; }
.note { color: var(--muted); font-size: 13px; }
table { width:100%; border-collapse: collapse; }
th, td { text-align:left; padding: 8px; border-bottom: 1px solid var(--line); }
a { color:#7dd3fc; }
.shots { display:flex; gap:12px; flex-wrap:wrap; }
.shots img { max-width: 280px; border-radius: 8px; }
svg { width: 100%; height: auto; background: var(--card); border-radius: 12px; }
`

/** Single-file offline HTML. Never invents metrics; omits empty optional sections. */
export function formatHtmlReport(report: unknown, options: HtmlReportOptions = {}): string {
  const input = isRecord(report) ? report : {}
  const score = asNumber(input.score)
  const profile = asString(input.profile) ?? 'unknown'
  const mode = asString(input.mode) ?? asString(input.qualityMode) ?? 'diagnose'
  const incomplete = input.incomplete === true
  const kind = scoreKind(input)
  const scoreLine =
    score === undefined
      ? '<p class="muted">No score in this JSON (not invented).</p>'
      : `<p class="score"><strong>${escapeHtml(String(score))}</strong> <span class="muted">${escapeHtml(kind)}</span></p>`
  const repo = options.repoUrl ?? asString(input.repository)
  const merged: HtmlReportOptions = { ...options }
  if (repo) merged.repoUrl = repo
  const exampleNote =
    input.example === true
      ? '<p class="note">Sample fixture. Numbers are copied from tests and the arcade-racer case study — not a live capture. Missing fields in real reports are omitted, never invented.</p>'
      : ''
  const strip = formatVerdictStrip(input)
  const stripHtml = strip ? `<p class="verdict-strip">${escapeHtml(strip)}</p>` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>threejs-doctor report</title>
<style>${CSS}</style>
</head>
<body>
<main>
  <h1>threejs-doctor report</h1>
  <p class="muted">profile=${escapeHtml(profile)} · mode=${escapeHtml(mode)}${
    incomplete ? ' · incomplete' : ''
  }</p>
  ${exampleNote}
  ${stripHtml}
  ${scoreLine}
  ${metricCards(input)}
  ${findingsSection(input, merged)}
  ${meshesSection(input)}
  ${gpuSection(input)}
  ${visualsSection(input)}
  ${trendSection(input)}
  <p class="note">Offline file. No telemetry. Missing fields were not measured — they are not filled in.</p>
</main>
</body>
</html>
`
}
