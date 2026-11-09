// npm run compare-charts -- <folder> [--update]
// Checks imports against a folder of real chart PDFs and their expected outputs, or with
// --update writes what each one imports as its new expected output. It writes only into the folder.
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ComparisonResult } from './compareCharts.ts'

const USAGE = `Usage: npm run compare-charts -- <folder> [--update]

Imports every PDF in <folder> and compares the result with the expected output
stored next to it as <name>.expected.json: size, legend entries, stitch count
per entry, and import issues. A PDF with no expected output is skipped.

  --update  Write what each PDF imports as its new expected output, in <folder> only.`

const args = process.argv.slice(2)
const update = args.includes('--update')
const folders = args.filter((arg) => arg !== '--update')

if (folders.length !== 1) {
  console.log(USAGE)
  process.exit(0)
}

// Node runs the import itself, given the two things Vite's config does for it in tests
// (see vite.config.ts): pdf.js's legacy build, and JSON imported without an import attribute.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'pdfjs-dist' ? 'pdfjs-dist/legacy/build/pdf.mjs' : specifier, context)
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.json') || context.importAttributes.type === 'json') return nextLoad(url, context)
    const json = readFileSync(fileURLToPath(url), 'utf8')
    return { format: 'module', source: `export default ${json}`, shortCircuit: true }
  },
})
const { compareChartFolder } = await import('./compareCharts.ts')

const results = await compareChartFolder(resolve(folders[0]), { update })
for (const result of results) console.log(describe(result))
if (results.length === 0) console.log(`No PDFs in ${folders[0]}`)
process.exitCode = results.some((result) => result.outcome === 'differs') ? 1 : 0

function describe(result: ComparisonResult) {
  if (result.outcome !== 'differs') return `${result.pdf}: ${result.outcome}`
  return [`${result.pdf}: differs`, ...result.differences.map((difference) => `  ${difference}`)].join('\n')
}
