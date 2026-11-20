import type { Chart } from '../workspace/chart.ts'
import { DeleteChartButton } from './DeleteChartButton.tsx'
import { chartHref } from './route.ts'

/** The Your charts page: every stored chart, each linking to its own page. */
export function ChartLibrary({ charts, onDelete }: { charts: Chart[]; onDelete: (chartId: string) => void }) {
  if (charts.length === 0) return <p>No charts yet. Import a chart PDF to start.</p>
  return (
    <section className="chart-library">
      <h2 id="chart-library-heading">Your charts</h2>
      <ul aria-labelledby="chart-library-heading">
        {charts.map((chart) => (
          <li key={chart.id} className="chart-library-row">
            <a className="chart-library-item" href={chartHref(chart.id)}>
              {chart.title ?? 'Untitled chart'}
            </a>
            <DeleteChartButton chart={chart} onDelete={() => onDelete(chart.id)} icon />
          </li>
        ))}
      </ul>
    </section>
  )
}
