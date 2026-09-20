export const PACKAGE_NAME = '@threejs-doctor/cli' as const
export { main, parseArgs } from './cli.js'
export { formatHumanReport } from './report/human.js'
export { formatJsonReport } from './report/json.js'
export { formatSarifReport } from './report/sarif.js'
export { formatHtmlReport } from './report/html.js'
export { EXAMPLE_REPORT, formatExampleReportJson } from './report/example-report.js'
export {
  HTML_REPORT_TOP_LEVEL_KEYS,
  KNOWN_REPORT_TOP_LEVEL_KEYS,
  collectUnrecognisedTopLevelKeys,
} from './report/known-keys.js'
