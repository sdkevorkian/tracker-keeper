// Writes small TrueType symbol fonts for synthetic chart PDFs, so tests never
// need a committed font file. Each glyph is a polygon on a 1000-unit em.

export type Shape = 'square' | 'triangle'

export interface TrueTypeFontDescription {
  /** PostScript name written to the font's name table. */
  name?: string
  /** Character code (0–255) to the shape drawn for it. */
  glyphs: Record<number, Shape>
}

type Point = readonly [x: number, y: number]
type Contour = readonly Point[]

const UNITS_PER_EM = 1000

// Outer contours run clockwise, as TrueType expects.
const SHAPES: Record<Shape, Contour[]> = {
  square: [
    [
      [100, 100],
      [100, 900],
      [900, 900],
      [900, 100],
    ],
  ],
  triangle: [
    [
      [100, 100],
      [500, 900],
      [900, 100],
    ],
  ],
}

class ByteWriter {
  private bytes: number[] = []

  get length() {
    return this.bytes.length
  }

  u8(value: number) {
    this.bytes.push(value & 0xff)
    return this
  }

  u16(value: number) {
    return this.u8(value >> 8).u8(value)
  }

  i16(value: number) {
    return this.u16(value < 0 ? value + 0x10000 : value)
  }

  u32(value: number) {
    return this.u16(Math.floor(value / 0x10000) & 0xffff).u16(value & 0xffff)
  }

  tag(value: string) {
    for (const char of value) this.u8(char.charCodeAt(0))
    return this
  }

  raw(values: ArrayLike<number>) {
    for (let i = 0; i < values.length; i++) this.u8(values[i])
    return this
  }

  pad(alignment: number) {
    while (this.bytes.length % alignment !== 0) this.u8(0)
    return this
  }

  toBytes() {
    return Uint8Array.from(this.bytes)
  }
}

interface Glyph {
  code: number
  contours: Contour[]
}

function bounds(contours: Contour[]) {
  const points = contours.flat()
  if (points.length === 0) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys),
  }
}

function glyfEntry(contours: Contour[]) {
  const out = new ByteWriter()
  if (contours.length === 0) return out.toBytes()
  const box = bounds(contours)
  out.i16(contours.length).i16(box.xMin).i16(box.yMin).i16(box.xMax).i16(box.yMax)
  let end = -1
  for (const contour of contours) out.u16((end += contour.length))
  out.u16(0) // no instructions
  const points = contours.flat()
  for (let i = 0; i < points.length; i++) out.u8(0x01) // on-curve, 16-bit deltas
  let previous = 0
  for (const [x] of points) {
    out.i16(x - previous)
    previous = x
  }
  previous = 0
  for (const [, y] of points) {
    out.i16(y - previous)
    previous = y
  }
  return out.pad(4).toBytes()
}

function cmapTable(glyphs: Glyph[]) {
  // (1,0) format 0 maps codes directly; (3,0) format 4 maps U+F000 + code,
  // the way symbol fonts do. One segment per glyph, then the 0xFFFF sentinel.
  const mac = new Array<number>(256).fill(0)
  glyphs.forEach((glyph, i) => (mac[glyph.code] = i + 1))

  const segments = [
    ...glyphs.map((glyph, i) => ({ char: 0xf000 + glyph.code, delta: (i + 1 - 0xf000 - glyph.code) & 0xffff })),
    { char: 0xffff, delta: 1 },
  ]
  const segCountX2 = segments.length * 2
  const entrySelector = Math.floor(Math.log2(segments.length))
  const searchRange = 2 * 2 ** entrySelector
  const format4 = new ByteWriter()
  format4
    .u16(4)
    .u16(16 + segments.length * 8)
    .u16(0)
    .u16(segCountX2)
    .u16(searchRange)
    .u16(entrySelector)
    .u16(segCountX2 - searchRange)
  for (const segment of segments) format4.u16(segment.char)
  format4.u16(0)
  for (const segment of segments) format4.u16(segment.char)
  for (const segment of segments) format4.u16(segment.delta)
  for (let i = 0; i < segments.length; i++) format4.u16(0)

  const format0Length = 262
  const out = new ByteWriter()
  out.u16(0).u16(2)
  out.u16(1).u16(0).u32(4 + 2 * 8)
  out.u16(3).u16(0).u32(4 + 2 * 8 + format0Length)
  out.u16(0).u16(format0Length).u16(0).raw(mac)
  out.raw(format4.toBytes())
  return out.toBytes()
}

function nameTable(name: string) {
  const records: [id: number, value: string][] = [
    [1, name],
    [2, 'Regular'],
    [4, name],
    [6, name],
  ]
  const strings = new ByteWriter()
  const out = new ByteWriter()
  out.u16(0).u16(records.length).u16(6 + records.length * 12)
  for (const [id, value] of records) {
    const offset = strings.length
    for (const char of value) strings.u16(char.charCodeAt(0))
    out.u16(3).u16(1).u16(0x409).u16(id).u16(value.length * 2).u16(offset)
  }
  return out.raw(strings.toBytes()).toBytes()
}

function checksum(bytes: Uint8Array) {
  let sum = 0
  for (let i = 0; i < bytes.length; i += 4) {
    const word =
      ((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)
    sum = (sum + (word >>> 0)) >>> 0
  }
  return sum
}

export function buildTrueTypeFont({ name = 'TestSymbols', glyphs }: TrueTypeFontDescription): Uint8Array {
  const sorted: Glyph[] = Object.entries(glyphs)
    .map(([code, shape]) => ({ code: Number(code), contours: SHAPES[shape] }))
    .sort((a, b) => a.code - b.code)
  const all: Contour[][] = [[], ...sorted.map((glyph) => glyph.contours)]
  const numGlyphs = all.length
  const fontBox = bounds(all.flat())

  const glyf = new ByteWriter()
  const loca = new ByteWriter()
  for (const contours of all) {
    loca.u32(glyf.length)
    glyf.raw(glyfEntry(contours))
  }
  loca.u32(glyf.length)

  const head = new ByteWriter()
  head
    .u32(0x00010000)
    .u32(0x00010000)
    .u32(0) // checkSumAdjustment, filled in below
    .u32(0x5f0f3cf5)
    .u16(0x000b)
    .u16(UNITS_PER_EM)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .i16(fontBox.xMin)
    .i16(fontBox.yMin)
    .i16(fontBox.xMax)
    .i16(fontBox.yMax)
    .u16(0)
    .u16(8)
    .i16(2)
    .i16(1) // long loca offsets
    .i16(0)

  const maxPoints = Math.max(0, ...all.map((contours) => contours.flat().length))
  const maxContours = Math.max(0, ...all.map((contours) => contours.length))

  const hhea = new ByteWriter()
  hhea
    .u32(0x00010000)
    .i16(900)
    .i16(-100)
    .i16(0)
    .u16(UNITS_PER_EM)
    .i16(fontBox.xMin)
    .i16(UNITS_PER_EM - fontBox.xMax)
    .i16(fontBox.xMax)
    .i16(1)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .u16(numGlyphs)

  const hmtx = new ByteWriter()
  for (const contours of all) hmtx.u16(UNITS_PER_EM).i16(bounds(contours).xMin)

  const maxp = new ByteWriter()
  maxp.u32(0x00010000).u16(numGlyphs).u16(maxPoints).u16(maxContours).u16(0).u16(0).u16(2)
  for (let i = 0; i < 9; i++) maxp.u16(0)

  const codes = sorted.map((glyph) => 0xf000 + glyph.code)
  const os2 = new ByteWriter()
  os2.u16(4).i16(UNITS_PER_EM).u16(400).u16(5).u16(0)
  for (let i = 0; i < 8; i++) os2.i16(0)
  os2.i16(50).i16(300).i16(0)
  os2.raw(new Array(10).fill(0))
  os2.u32(0).u32(0).u32(0).u32(0)
  os2.tag('NONE')
  os2.u16(0x40).u16(Math.min(0xffff, ...codes)).u16(Math.max(0, ...codes))
  os2.i16(900).i16(-100).i16(0)
  os2.u16(900).u16(100)
  os2.u32(0x80000000).u32(0) // symbol character set
  os2.i16(500).i16(800).u16(0).u16(0x20).u16(1)

  const post = new ByteWriter()
  post.u32(0x00030000).u32(0).i16(-100).i16(50)
  for (let i = 0; i < 5; i++) post.u32(0)

  const tables: [tag: string, data: Uint8Array][] = [
    ['OS/2', os2.toBytes()],
    ['cmap', cmapTable(sorted)],
    ['glyf', glyf.toBytes()],
    ['head', head.toBytes()],
    ['hhea', hhea.toBytes()],
    ['hmtx', hmtx.toBytes()],
    ['loca', loca.toBytes()],
    ['maxp', maxp.toBytes()],
    ['name', nameTable(name)],
    ['post', post.toBytes()],
  ]

  const entrySelector = Math.floor(Math.log2(tables.length))
  const searchRange = 16 * 2 ** entrySelector
  const out = new ByteWriter()
  out.u32(0x00010000).u16(tables.length).u16(searchRange).u16(entrySelector).u16(tables.length * 16 - searchRange)
  let offset = 12 + tables.length * 16
  for (const [tag, data] of tables) {
    out.tag(tag).u32(checksum(data)).u32(offset).u32(data.length)
    offset += Math.ceil(data.length / 4) * 4
  }
  let headOffset = 0
  for (const [tag, data] of tables) {
    if (tag === 'head') headOffset = out.length
    out.raw(data).pad(4)
  }

  const font = out.toBytes()
  const adjustment = (0xb1b0afba - checksum(font)) >>> 0
  new DataView(font.buffer).setUint32(headOffset + 8, adjustment)
  return font
}
