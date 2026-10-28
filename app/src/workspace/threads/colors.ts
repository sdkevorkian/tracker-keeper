// Thread colors bundled with the app. dmc-floss.json is craft-color-codes'
// data file, unchanged, under CC BY 4.0 (see docs/adr/0002-dmc-color-table.md).
import dmcFloss from './dmc-floss.json'

const dmc = new Map(dmcFloss.colors.map(({ code, hex }) => [code.toUpperCase(), hex]))

/** The bundled color for a thread, as `#RRGGBB`, or undefined if the app has none. */
export function bundledColor(thread: { brand: string; code: string }): string | undefined {
  if (thread.brand.toUpperCase() !== 'DMC') return undefined
  return dmc.get(thread.code.toUpperCase())
}
