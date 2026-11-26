/** What one cell of a project's progress is. More states can be added later without migrating data. */
export const NOT_DONE = 0
export const DONE = 1

/** The fabric a project starts on, until the stitcher picks another. */
export const WHITE_FABRIC = '#ffffff'

/** The color done stitches are marked in, until the stitcher picks another: a green that stands out on most threads. */
export const DEFAULT_DONE_COLOR = '#5bbf6a'

/** How the app draws a chart. A viewing choice: switching it never changes the chart. */
export type DisplayStyle = 'symbols only' | 'color blocks' | 'color with symbols'

/** Every display style, in the order the app offers them. */
export const DISPLAY_STYLES: readonly DisplayStyle[] = ['symbols only', 'color blocks', 'color with symbols']

/** The display style before the stitcher has picked one. */
export const DEFAULT_DISPLAY_STYLE: DisplayStyle = 'color with symbols'

export function isDisplayStyle(value: unknown): value is DisplayStyle {
  return DISPLAY_STYLES.includes(value as DisplayStyle)
}

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
  /** The color done stitches are marked in, as `#rrggbb`. */
  doneColor: string
  /** How the project's chart is drawn. */
  displayStyle: DisplayStyle
  /** One state per cell of the chart, in the chart's cell order. */
  progress: Uint8Array
}
