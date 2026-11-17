// Which page of the source PDF matches what the canvas shows, so it can be
// opened beside the chart. A plain function, so it's tested without pixels.
import type { SourcePage } from '../workspace/chart.ts'
import type { Size, Viewport } from './viewport.ts'

/**
 * The page of the source PDF covering the stitch in the middle of the view.
 * Where neighbouring pages repeat stitches, the first page listed wins; with
 * the middle off the chart, the stitch nearest it on the chart is used.
 */
export function pageForView({ x, y, cellSize }: Viewport, canvas: Size, pages: SourcePage[]): number | undefined {
  if (pages.length === 0) return undefined
  // Pages number stitches from 1, as printed in a chart's margins.
  const across = Math.floor(x + canvas.width / cellSize / 2) + 1
  const down = Math.floor(y + canvas.height / cellSize / 2) + 1
  const clamp = (stitch: number, ends: [number, number][]) =>
    Math.min(Math.max(stitch, Math.min(...ends.map(([first]) => first))), Math.max(...ends.map(([, last]) => last)))
  const column = clamp(
    across,
    pages.map((page) => page.across),
  )
  const row = clamp(
    down,
    pages.map((page) => page.down),
  )
  const covers = ([first, last]: [number, number], stitch: number) => first <= stitch && stitch <= last
  return pages.find((page) => covers(page.across, column) && covers(page.down, row))?.page
}
