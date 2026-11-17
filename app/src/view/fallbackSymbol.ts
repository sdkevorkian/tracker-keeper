// Built-in symbols, for legend entries with no example cell in the source PDF
// to cut their printed symbol from.

/**
 * Shapes first, then letters and digits. Characters easily mistaken for
 * another (l and I, o and O, 0 and O, 1 and I) are left out. All are in
 * the fonts every system has, so the canvas can draw them as text.
 */
const SYMBOLS = [
  ...'●■▲▼◆★✚✖♥♠♣♦◐◑◒◓▶◀☀☾✿❖⬟⬢',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijkmnpqrstuvwxyz',
  ...'23456789',
  ...'ΔΘΛΞΠΣΦΨΩ',
  ...'αβγδεζηθλμπσφψω',
]

/** The built-in symbol for legend entry `entry`, numbered from 1 as in a chart's cells. A legend longer than the set reuses it from the start. */
export function fallbackSymbol(entry: number): string {
  return SYMBOLS[(entry - 1) % SYMBOLS.length]
}
