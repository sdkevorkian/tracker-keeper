import type { Chart } from '../workspace/chart.ts'
import { DeleteChartButton } from './DeleteChartButton.tsx'
import { chartHref, projectHref } from './route.ts'

/** A project as Your charts lists it. */
export interface ListedProject {
  id: string
  name: string
  percentDone: number
}

/** A chart as Your charts lists it, with its projects, oldest first. */
export interface ListedChart {
  chart: Chart
  projects: ListedProject[]
}

/** The Your charts page: every stored chart, each linking to its own page, with its projects under it. */
export function ChartLibrary({ charts, onDelete }: { charts: ListedChart[]; onDelete: (chartId: string) => void }) {
  if (charts.length === 0) return <p>No charts yet. Import a chart PDF to start.</p>
  return (
    <section className="chart-library">
      <h2 id="chart-library-heading">Your charts</h2>
      <ul aria-labelledby="chart-library-heading">
        {charts.map(({ chart, projects }) => {
          const title = chart.title ?? 'Untitled chart'
          return (
            <li key={chart.id} className="chart-library-entry">
              <div className="chart-library-row">
                <a className="chart-library-item" href={chartHref(chart.id)}>
                  {title}
                </a>
                <DeleteChartButton chart={chart} onDelete={() => onDelete(chart.id)} icon />
              </div>
              {projects.length > 0 && (
                <ul className="project-list" aria-label={`Projects of ${title}`}>
                  {projects.map((project) => (
                    <li key={project.id} className="project-list-item">
                      <a href={projectHref(project.id)}>{project.name}</a>
                      <span>{project.percentDone}% done</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
