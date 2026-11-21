/** What one cell of a project's progress is. More states can be added later without migrating data. */
export const NOT_DONE = 0
export const DONE = 1

/** The fabric a project starts on, until the stitcher picks another. */
export const WHITE_FABRIC = '#ffffff'

/** One stitching of a chart, with its own progress. */
export interface Project {
  id: string
  chartId: string
  /** The chart's title when the project starts, until the stitcher renames it. */
  name: string
  /** When the project was started, as an ISO 8601 timestamp. */
  startedAt: string
  /** The color of the fabric, as `#rrggbb`, which the chart's background is tinted with. */
  fabricColor: string
  /** One state per cell of the chart, in the chart's cell order. */
  progress: Uint8Array
}
