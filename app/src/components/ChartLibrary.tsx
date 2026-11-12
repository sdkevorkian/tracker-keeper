import type { Chart } from '../workspace/chart.ts'
import { chartHref } from './route.ts'

/** The Your charts page: every stored chart, each linking to its own page. */
export function ChartLibrary({ charts }: { charts: Chart[] }) {
  if (charts.length === 0) return <p>No charts yet. Import a chart PDF to start.</p>
  return (
    <section className="chart-library">
      <h2 id="chart-library-heading">Your charts</h2>
      <ul aria-labelledby="chart-library-heading">
        {charts.map((chart) => (
          <li key={chart.id}>
            <a className="chart-library-item" href={chartHref(chart.id)}>
              {chart.title ?? 'Untitled chart'}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
