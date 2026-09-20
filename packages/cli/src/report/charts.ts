import { PROFILE_BUDGETS, type ConcreteProfile } from '@threejs-doctor/rules'
import { metricLabel } from './metric-labels.js'
import {
  asNumber,
  badgeForMetric,
  COST_METRICS,
  formatMetricDelta,
  isRecord,
  SCENE_FACT_METRICS,
  type BadgeState,
  type JsonMap,
} from './verdict.js'

const CONCRETE_PROFILES = new Set<string>(['marketing', 'product', 'game', 'cad'])

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

export function badgeMarker(badge: BadgeState): string {
  if (badge === 'win') return '▲'
  if (badge === 'loss') return '▼'
  return '●'
}

function formatNum(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

export function percentile(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  if (p <= 0) return sorted[0]
  if (p >= 1) return sorted[sorted.length - 1]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function noiseThreshold(input: JsonMap, key: string, before: number): number | undefined {
  const bands = input.noiseBand
  if (!isRecord(bands)) return undefined
  const band = bands[key]
  if (!isRecord(band)) return undefined
  const abs = asNumber(band.abs)
  const rel = asNumber(band.rel)
  if (abs === undefined || rel === undefined) return undefined
  return Math.max(abs, Math.abs(before) * rel)
}

export function gpuPassRows(input: JsonMap): Array<{ pass: string; ms: number }> | undefined {
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

export function captures(input: JsonMap): Array<{ label: string; dataUrl: string }> {
  const raw = input.captures ?? input.visuals ?? input.screenshots
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!isRecord(item)) return []
    const dataUrl = asString(item.dataUrl) ?? asString(item.src)
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return []
    return [{ label: asString(item.label) ?? 'capture', dataUrl }]
  })
}

export function historyPoints(input: JsonMap): Array<{ label: string; score: number }> {
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

export function frameTimesMsOf(input: JsonMap): number[] | undefined {
  const raw = input.frameTimesMs
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const times: number[] = []
  for (const item of raw) {
    const ms = asNumber(item)
    if (ms === undefined) continue
    times.push(ms)
  }
  return times.length > 0 ? times : undefined
}

function isShadowPass(name: string): boolean {
  return /shadow/i.test(name)
}

const PASS_FILLS = ['#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#fb923c']

export function deltaBarsSection(input: JsonMap): string {
  const baseline = isRecord(input.baseline) ? input.baseline : undefined
  const after = isRecord(input.after) ? input.after : undefined
  if (!baseline || !after) return ''
  const keys = [...COST_METRICS, ...SCENE_FACT_METRICS]
  type Row = {
    key: string
    before: number
    after: number
    delta: number
    threshold?: number
    badge?: BadgeState
  }
  const rows: Row[] = []
  let domain = 1
  for (const key of keys) {
    const before = asNumber(baseline[key])
    const afterVal = asNumber(after[key])
    if (before === undefined || afterVal === undefined) continue
    const delta = afterVal - before
    const threshold = noiseThreshold(input, key, before)
    const badge = badgeForMetric(input, key)
    const row: Row = { key, before, after: afterVal, delta }
    if (threshold !== undefined) row.threshold = threshold
    if (badge !== undefined) row.badge = badge
    rows.push(row)
    domain = Math.max(domain, Math.abs(delta), threshold ?? 0)
  }
  if (rows.length === 0) return ''

  const plotLeft = 210
  const plotRight = 630
  const mid = (plotLeft + plotRight) / 2
  const half = (plotRight - plotLeft) / 2
  const rowH = 36
  const top = 8
  const h = top + rows.length * rowH + 8
  const xAt = (delta: number) => mid + (delta / domain) * half

  const body = rows
    .map((row, i) => {
      const y = top + i * rowH
      const xDelta = xAt(row.delta)
      const barX = Math.min(mid, xDelta)
      const barW = Math.max(1, Math.abs(xDelta - mid))
      const grow = row.delta < 0 ? 'grow-left' : 'grow-right'
      const marker = row.badge ? badgeMarker(row.badge) : '●'
      const deltaText = formatMetricDelta(row.key, row.before, row.after)
      const fill =
        row.badge === 'win' ? 'var(--win)' : row.badge === 'loss' ? 'var(--loss)' : 'var(--noise)'
      const band =
        row.threshold === undefined
          ? ''
          : `<rect class="noise-band" x="${escapeHtml(String(xAt(-row.threshold)))}" y="${y + 8}" width="${escapeHtml(
              String(Math.max(0, xAt(row.threshold) - xAt(-row.threshold))),
            )}" height="16" rx="2"/>`
      return `<g>
        <text x="8" y="${y + 20}" fill="var(--fg)" font-size="12">${escapeHtml(marker)} ${escapeHtml(
          metricLabel(row.key),
        )}</text>
        ${band}
        <line x1="${mid}" y1="${y + 4}" x2="${mid}" y2="${y + 28}" stroke="var(--line)"/>
        <rect class="anim-bar ${grow}" x="${barX}" y="${y + 10}" width="${barW}" height="12" rx="2" fill="${fill}"/>
        <text x="${plotRight}" y="${y + 20}" text-anchor="end" fill="var(--muted)" font-size="11">${escapeHtml(
          formatNum(row.before),
        )} → ${escapeHtml(formatNum(row.after))} (${escapeHtml(deltaText)})</text>
      </g>`
    })
    .join('')

  const summary = rows
    .map((row) => `${metricLabel(row.key)} ${formatMetricDelta(row.key, row.before, row.after)}`)
    .join(', ')
  return `<section><h2>Deltas vs noise</h2>
    <svg viewBox="0 0 640 ${h}" role="img" aria-label="Deltas versus noise band: ${escapeHtml(summary)}">
      ${body}
    </svg>
    <p class="note">Translucent band is the report noise threshold (max of abs and |before| × rel). ▲ win · ▼ loss · ● unchanged / inside-noise / unscored.</p>
  </section>`
}

function stackedSegments(
  rows: Array<{ pass: string; ms: number }>,
  opts: { id: string; aria: string; unit: '%' | 'ms' },
): string {
  const sum = rows.reduce((acc, row) => acc + row.ms, 0)
  if (sum <= 0) return ''
  const x0 = 16
  const width = 608
  let x = x0
  let colorIndex = 0
  const hatchId = opts.id === 'cost' ? 'hatch-shadow' : 'gpu-hatch-shadow'
  const segs = rows.map((row) => {
    const w = (row.ms / sum) * width
    const shadow = isShadowPass(row.pass)
    const fill = shadow ? `url(#${hatchId})` : PASS_FILLS[colorIndex++ % PASS_FILLS.length]!
    const label = opts.unit === '%' ? `${Math.round((row.ms / sum) * 100)}%` : `${formatNum(row.ms)} ms`
    const text =
      w > 56
        ? `<text x="${x + w / 2}" y="42" text-anchor="middle" fill="var(--fg)" font-size="11">${escapeHtml(row.pass)} ${escapeHtml(label)}</text>`
        : ''
    const rect = `<rect class="anim-bar grow-right" x="${x}" y="20" width="${Math.max(w, 1)}" height="24" fill="${fill}"/>${text}`
    x += w
    return rect
  })
  const legend = rows
    .map((row) => {
      const share = `${Math.round((row.ms / sum) * 100)}%`
      const mark = isShadowPass(row.pass) ? ' (hatched shadow-map)' : ''
      return `${row.pass} ${formatNum(row.ms)} ms (${share})${mark}`
    })
    .join('; ')
  return `<svg viewBox="0 0 640 72" role="img" aria-label="${escapeHtml(opts.aria)} ${escapeHtml(legend)}">
      <defs>
        <pattern id="${hatchId}" patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#334155"/>
          <path d="M0 6 L6 0" stroke="#94a3b8" stroke-width="1.2"/>
        </pattern>
      </defs>
      ${segs.join('')}
    </svg>`
}

export function costAttributionSection(input: JsonMap): string {
  const rows = gpuPassRows(input)
  if (!rows) return ''
  const sum = rows.reduce((acc, row) => acc + row.ms, 0)
  if (sum <= 0) return ''
  const chart = stackedSegments(rows, {
    id: 'cost',
    aria: 'Cost attribution stacked bar',
    unit: '%',
  })
  const body = rows
    .map((row) => {
      const share = `${Math.round((row.ms / sum) * 100)}%`
      const hatchNote = isShadowPass(row.pass) ? ' (shadow-map, hatched)' : ''
      return `<tr><td>${escapeHtml(row.pass)}${hatchNote}</td><td>${escapeHtml(formatNum(row.ms))}</td><td>${share}</td></tr>`
    })
    .join('')
  return `<section><h2>Cost attribution</h2>
    ${chart}
    <table><thead><tr><th>Pass</th><th>ms</th><th>Share of measured GPU</th></tr></thead><tbody>${body}</tbody></table>
    <p class="note">Shares are of measured GPU pass times only. Unmeasured passes are omitted, not filled in as zero.</p>
  </section>`
}

export function gpuPassChart(rows: Array<{ pass: string; ms: number }>): string {
  return stackedSegments(rows, {
    id: 'gpu',
    aria: 'GPU time per pass stacked bar',
    unit: 'ms',
  })
}

export function histogramSection(input: JsonMap): string {
  const times = frameTimesMsOf(input)
  if (!times) return ''
  const p50 = percentile(times, 0.5)
  const p95 = percentile(times, 0.95)
  if (p50 === undefined || p95 === undefined) return ''
  const min = Math.min(...times)
  const max = Math.max(...times)
  const binCount = times.length === 1 || min === max ? 1 : Math.min(10, times.length)
  const width = binCount === 1 ? 1 : (max - min) / binCount
  const bins = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * width,
    x1: binCount === 1 ? max : min + (i + 1) * width,
    count: 0,
  }))
  for (const ms of times) {
    let i = binCount === 1 || width === 0 ? 0 : Math.floor((ms - min) / width)
    if (i >= binCount) i = binCount - 1
    if (i < 0) i = 0
    bins[i]!.count++
  }
  const maxCount = Math.max(1, ...bins.map((b) => b.count))
  const left = 40
  const right = 620
  const top = 16
  const bottom = 150
  const plotW = right - left
  const plotH = bottom - top
  const barW = plotW / bins.length
  const bars = bins
    .map((bin, i) => {
      const bh = (bin.count / maxCount) * plotH
      const x = left + i * barW
      const y = bottom - bh
      return `<rect class="anim-bar grow-up" x="${x + 2}" y="${y}" width="${Math.max(barW - 4, 1)}" height="${Math.max(bh, 0)}" fill="#38bdf8"/>`
    })
    .join('')
  const xAt = (ms: number) => {
    if (max === min) return left + plotW / 2
    return left + ((ms - min) / (max - min)) * plotW
  }
  const marker = (ms: number, label: string) => {
    const x = xAt(ms)
    return `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#fbbf24" stroke-dasharray="3 3"/>
      <text x="${x}" y="${top + 10}" fill="#fbbf24" font-size="11" text-anchor="middle">${escapeHtml(label)} ${escapeHtml(formatNum(ms))}</text>`
  }
  return `<section><h2>Frame-time histogram</h2>
    <svg viewBox="0 0 640 180" role="img" aria-label="Frame-time histogram, p50 ${formatNum(p50)} ms, p95 ${formatNum(p95)} ms, n=${times.length}">
      ${bars}
      ${marker(p50, 'p50')}
      ${marker(p95, 'p95')}
      <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="var(--line)"/>
      <text x="${left}" y="172" fill="var(--muted)" font-size="11">${escapeHtml(formatNum(min))} ms</text>
      <text x="${right}" y="172" text-anchor="end" fill="var(--muted)" font-size="11">${escapeHtml(formatNum(max))} ms</text>
    </svg>
    <p class="note">p50 ${escapeHtml(formatNum(p50))} ms · p95 ${escapeHtml(formatNum(p95))} ms · n=${times.length}. Computed from <code>frameTimesMs</code> in this JSON — not invented.</p>
  </section>`
}

export function budgetGaugeSection(input: JsonMap): string {
  const profile = asString(input.profile)
  if (!profile || !CONCRETE_PROFILES.has(profile)) return ''
  const budget = PROFILE_BUDGETS[profile as ConcreteProfile].maxTriangles
  const after = isRecord(input.after) ? input.after : undefined
  const baseline = isRecord(input.baseline) ? input.baseline : undefined
  const triangles = after ? asNumber(after.triangles) : undefined
  const used = triangles ?? (baseline ? asNumber(baseline.triangles) : undefined)
  if (used === undefined) return ''
  const ratio = budget > 0 ? Math.min(used / budget, 1) : 0
  const over = used > budget
  const marker = over ? '▼' : '▲'
  const fillW = Math.max(ratio * 360, used === 0 ? 0 : 2)
  const fill = over ? 'var(--loss)' : 'var(--win)'
  const which = triangles !== undefined ? 'after' : 'baseline'
  return `<section><h2>Triangle budget</h2>
    <svg viewBox="0 0 400 88" role="img" aria-label="Triangles ${formatNum(used)} of ${profile} budget ${budget} (${which})">
      <rect x="20" y="28" width="360" height="16" rx="8" fill="#1e293b"/>
      <rect class="anim-bar grow-right" x="20" y="28" width="${fillW}" height="16" rx="8" fill="${fill}"/>
      <text x="200" y="20" text-anchor="middle" fill="var(--fg)" font-size="13">${escapeHtml(marker)} ${escapeHtml(
        formatNum(used),
      )} / ${escapeHtml(String(budget))} (${escapeHtml(profile)})</text>
      <text x="20" y="64" fill="var(--muted)" font-size="11">0</text>
      <text x="380" y="64" text-anchor="end" fill="var(--muted)" font-size="11">${escapeHtml(String(budget))}</text>
    </svg>
    <p class="note">${escapeHtml(which)} drawn triangles vs <code>PROFILE_BUDGETS.${escapeHtml(profile)}.maxTriangles</code>. ${
      over ? '▼ over budget.' : '▲ under budget.'
    }</p>
  </section>`
}

export function trendSection(input: JsonMap): string {
  const points = historyPoints(input)
  if (points.length < 2) return ''
  const scores = points.map((p) => p.score)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 100)
  const span = Math.max(1, max - min)
  const left = 44
  const right = 620
  const top = 16
  const bottom = 150
  const xAt = (i: number) => left + (i / (points.length - 1)) * (right - left)
  const yAt = (score: number) => bottom - ((score - min) / span) * (bottom - top)
  const poly = points.map((p, i) => `${xAt(i)},${yAt(p.score)}`).join(' ')
  const area = `${poly} ${xAt(points.length - 1)},${bottom} ${xAt(0)},${bottom}`
  const ticks = [0, 25, 50, 75, 100].filter((t) => t >= min && t <= max)
  const tickMarkup = ticks
    .map((t) => {
      const y = yAt(t)
      return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="var(--line)" stroke-opacity="0.6"/>
        <text x="${left - 6}" y="${y + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${t}</text>`
    })
    .join('')
  const dots = points
    .map((p, i) => {
      return `<circle cx="${xAt(i)}" cy="${yAt(p.score)}" r="5" fill="#7dd3fc"><title>${escapeHtml(p.label)}: ${escapeHtml(
        formatNum(p.score),
      )}</title></circle>
        <text x="${xAt(i)}" y="${bottom + 18}" text-anchor="middle" fill="var(--muted)" font-size="11">${escapeHtml(p.label)}</text>
        <text x="${xAt(i)}" y="${yAt(p.score) - 10}" text-anchor="middle" fill="var(--fg)" font-size="11">${escapeHtml(
          formatNum(p.score),
        )}</text>`
    })
    .join('')
  const labels = points.map((p) => escapeHtml(p.label)).join(' → ')
  return `<section><h2>Score trend</h2>
    <svg viewBox="0 0 640 200" role="img" aria-label="Score history ${labels}">
      <defs>
        <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${tickMarkup}
      <polygon fill="url(#trend-area)" points="${area}"/>
      <polyline class="trend-line" fill="none" stroke="#7dd3fc" stroke-width="3" points="${poly}" pathLength="1"/>
      ${dots}
    </svg>
    <p class="note">${labels}</p>
  </section>`
}

export function visualsSection(input: JsonMap): string {
  const shots = captures(input)
  if (shots.length === 0) return ''
  if (shots.length < 2) {
    const figs = shots
      .map(
        (shot) =>
          `<figure><img alt="${escapeHtml(shot.label)}" src="${escapeHtml(shot.dataUrl)}"/><figcaption>${escapeHtml(shot.label)}</figcaption></figure>`,
      )
      .join('')
    return `<section><h2>Visuals</h2><div class="shots">${figs}</div></section>`
  }
  const before = shots[0]!
  const after = shots[1]!
  return `<section><h2>Visuals</h2>
    <div class="vis-ui">
      <input type="radio" name="vis-mode" id="vis-slider" checked/>
      <input type="radio" name="vis-mode" id="vis-heat"/>
      <div class="vis-tabs">
        <label for="vis-slider">Slider</label>
        <label for="vis-heat">Diff heatmap</label>
      </div>
      <div class="compare" data-compare style="--split:50%">
        <div class="compare-frame">
          <img class="compare-after" alt="${escapeHtml(after.label)}" src="${escapeHtml(after.dataUrl)}"/>
          <img class="compare-before" alt="${escapeHtml(before.label)}" src="${escapeHtml(before.dataUrl)}"/>
        </div>
        <input type="range" min="0" max="100" value="50" aria-label="Reveal before versus after"/>
      </div>
    </div>
    <p class="note">${escapeHtml(before.label)} / ${escapeHtml(after.label)}. Diff heatmap is a CSS difference blend of the two embedded captures — not a generated heatmap image. Extra captures after the first two are omitted from the slider.</p>
  </section>`
}

export function compareEnhancementScript(input: JsonMap): string {
  if (captures(input).length < 2) return ''
  return `<script>
(function(){
  var roots=document.querySelectorAll('[data-compare]');
  for (var i=0;i<roots.length;i++){
    var root=roots[i];
    var range=root.querySelector('input[type=range]');
    if(!range) continue;
    var apply=function(){ root.style.setProperty('--split', range.value + '%'); };
    range.addEventListener('input', apply);
    apply();
  }
})();
</script>`
}

export const REPORT_CHART_CSS = `
.anim-bar { transform-box: fill-box; animation: bar-in 0.7s ease both; }
.anim-bar.grow-right { transform-origin: left center; }
.anim-bar.grow-left { transform-origin: right center; }
.anim-bar.grow-up { transform-origin: bottom center; }
@keyframes bar-in { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.anim-bar.grow-up { animation-name: bar-in-y; }
@keyframes bar-in-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.trend-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw-line 0.9s ease forwards; }
@keyframes draw-line { to { stroke-dashoffset: 0; } }
.card, .finding { animation: fade-up 0.45s ease both; }
@keyframes fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.noise-band { fill: #fbbf24; fill-opacity: 0.22; }
.vis-ui { position: relative; }
.vis-ui > input[type=radio] { position: absolute; width: 1px; height: 1px; opacity: 0.001; }
.vis-tabs { display: flex; gap: 8px; margin: 0 0 10px; }
.vis-tabs label { cursor: pointer; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; font-size: 13px; }
#vis-slider:checked ~ .vis-tabs label[for="vis-slider"],
#vis-heat:checked ~ .vis-tabs label[for="vis-heat"] { background: var(--line); }
.compare { --split: 50%; }
.compare-frame { position: relative; overflow: hidden; background: #020617; border-radius: 8px; }
.compare-frame img { display: block; width: 100%; height: auto; }
.compare-before {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
  clip-path: inset(0 calc(100% - var(--split, 50%)) 0 0);
}
.compare input[type=range] { width: 100%; margin-top: 8px; }
#vis-heat:checked ~ .compare .compare-before { clip-path: none; mix-blend-mode: difference; }
#vis-heat:checked ~ .compare input[type=range] { display: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
@media print {
  :root { color-scheme: light; }
  body { background: #fff; color: #111; }
  main { max-width: none; padding: 0; }
  a { color: #06c; }
  .card, .finding, svg, table, .compare-frame { break-inside: avoid; }
  .vis-tabs, .vis-ui > input[type=radio], .compare input[type=range] { display: none !important; }
  .compare-frame { display: flex; gap: 12px; overflow: visible; background: transparent; }
  .compare-frame img { width: 50%; position: static; }
  .compare-before { position: static !important; clip-path: none !important; mix-blend-mode: normal !important; inset: auto; }
  .shots img { max-width: none; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`
