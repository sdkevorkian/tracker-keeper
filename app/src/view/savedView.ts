// Where each page last had the chart zoomed and panned, and its cell cursor, so a reload opens it
// there again. Kept in this browser only: the right view depends on the screen, so it isn't part of the project.
import type { CellPosition } from './cells.ts'
import type { Size, Viewport } from './viewport.ts'

const PREFIX = 'tracker-keeper:'

/** The value saved under `key` if `isValid` accepts it, or undefined when none is, or storage can't be read. */
function load<T>(key: string, isValid: (value: Record<string, unknown>) => boolean): T | undefined {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return undefined
    return isValid(saved as Record<string, unknown>) ? (saved as T) : undefined
  } catch {
    return undefined
  }
}

/** Saves `value` under `key`, or forgets it when undefined. Storage that can't be written is ignored. */
function save(key: string, value: object | undefined) {
  try {
    if (value) localStorage.setItem(PREFIX + key, JSON.stringify(value))
    else localStorage.removeItem(PREFIX + key)
  } catch {
    // A private window or blocked storage only means it isn't kept.
  }
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** The view saved under `key`, or undefined when there's none. */
export function loadView(key: string): Viewport | undefined {
  const saved = load<Viewport>(
    `view:${key}`,
    ({ x, y, cellSize }) => isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(cellSize) && cellSize > 0,
  )
  return saved && { x: saved.x, y: saved.y, cellSize: saved.cellSize }
}

/** Saves the view under `key`, or forgets it when undefined (the whole chart fitted). */
export function saveView(key: string, viewport: Viewport | undefined) {
  save(`view:${key}`, viewport)
}

/** The cell cursor saved under `key`, or undefined when there's none or it's no longer on the chart. */
export function loadCursor(key: string, chart: Size): CellPosition | undefined {
  const saved = load<CellPosition>(
    `cursor:${key}`,
    ({ column, row }) =>
      Number.isInteger(column) &&
      Number.isInteger(row) &&
      (column as number) >= 0 &&
      (row as number) >= 0 &&
      (column as number) < chart.width &&
      (row as number) < chart.height,
  )
  return saved && { column: saved.column, row: saved.row }
}

export function saveCursor(key: string, cursor: CellPosition) {
  save(`cursor:${key}`, cursor)
}
