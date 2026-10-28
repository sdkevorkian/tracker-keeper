// Turns each PDF page into neutral primitives for the parser. It knows about
// pdf.js and nothing about charts, so another engine could replace it.
import { getDocument, OPS } from 'pdfjs-dist'

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Glyph {
  /** Font name, without any `ABCDEF+` subset prefix. */
  font: string
  /** The raw character code. Symbols are identified by this, never by `unicode`. */
  code: number
  /** What the font says the character is; only meaningful for ordinary text. */
  unicode: string
  /** Page coordinates, y up. */
  box: Box
}

export type Point = [x: number, y: number]

export type PathCommand =
  | { type: 'move'; to: Point }
  | { type: 'line'; to: Point }
  | { type: 'curve'; points: Point[] }
  | { type: 'close' }

export interface Path {
  commands: PathCommand[]
  stroke: boolean
  fill: boolean
  lineWidth: number
}

export interface PagePrimitives {
  glyphs: Glyph[]
  paths: Path[]
}

type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

// pdf.js path data: each operation code is followed by its points.
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 }

const STROKES = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
])
const FILLS = new Set<number>([
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
])

/** `a` applied first, then `b`. */
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ]
}

function apply(m: Matrix, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

function boxOf(points: Point[]): Box {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

function withoutSubsetPrefix(name: string) {
  return name.replace(/^[A-Z]{6}\+/, '')
}

interface TextState {
  font: string
  ascent: number
  descent: number
  size: number
  charSpacing: number
  wordSpacing: number
  hScale: number
  leading: number
  rise: number
}

interface GraphicsState {
  ctm: Matrix
  lineWidth: number
  text: TextState
}

function readPath(data: ArrayLike<number>, ctm: Matrix): PathCommand[] {
  const commands: PathCommand[] = []
  const points = (at: number, count: number) =>
    Array.from({ length: count }, (_, i): Point => apply(ctm, [data[at + i * 2], data[at + i * 2 + 1]]))
  for (let at = 0; at < data.length; ) {
    switch (data[at++]) {
      case DRAW.moveTo:
        commands.push({ type: 'move', to: points(at, 1)[0] })
        at += 2
        break
      case DRAW.lineTo:
        commands.push({ type: 'line', to: points(at, 1)[0] })
        at += 2
        break
      case DRAW.curveTo:
        commands.push({ type: 'curve', points: points(at, 3) })
        at += 6
        break
      case DRAW.quadraticCurveTo:
        commands.push({ type: 'curve', points: points(at, 2) })
        at += 4
        break
      case DRAW.closePath:
        commands.push({ type: 'close' })
        break
      default:
        throw new Error(`Unknown path operation ${data[at - 1]}`)
    }
  }
  return commands
}

export async function extractPages(bytes: Uint8Array): Promise<PagePrimitives[]> {
  const loading = getDocument({
    // pdf.js takes ownership of the buffer it is given.
    data: bytes.slice(),
    disableFontFace: true,
    fontExtraProperties: true,
    verbosity: 0,
  })
  const document = await loading.promise
  try {
    const pages: PagePrimitives[] = []
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      const operators = await page.getOperatorList()
      const glyphs: Glyph[] = []
      const paths: Path[] = []
      const stack: GraphicsState[] = []
      let state: GraphicsState = {
        ctm: IDENTITY,
        lineWidth: 1,
        text: {
          font: '',
          ascent: 0.8,
          descent: -0.2,
          size: 0,
          charSpacing: 0,
          wordSpacing: 0,
          hScale: 1,
          leading: 0,
          rise: 0,
        },
      }
      let line: Matrix = IDENTITY
      let text: Matrix = IDENTITY
      const moveLine = (x: number, y: number) => {
        line = multiply([1, 0, 0, 1, x, y], line)
        text = line
      }

      operators.fnArray.forEach((fn, i) => {
        const args = operators.argsArray[i]
        switch (fn) {
          case OPS.save:
            stack.push(state)
            state = { ...state, text: { ...state.text } }
            break
          case OPS.restore:
            state = stack.pop() ?? state
            break
          case OPS.transform:
            state.ctm = multiply(args as Matrix, state.ctm)
            break
          case OPS.setLineWidth:
            state.lineWidth = args[0]
            break
          case OPS.beginText:
            line = text = IDENTITY
            break
          case OPS.setFont: {
            const font = page.commonObjs.get(args[0])
            state.text.font = withoutSubsetPrefix(font.name ?? '')
            state.text.ascent = font.ascent || 0.8
            state.text.descent = font.descent || -0.2
            state.text.size = args[1]
            break
          }
          case OPS.setCharSpacing:
            state.text.charSpacing = args[0]
            break
          case OPS.setWordSpacing:
            state.text.wordSpacing = args[0]
            break
          case OPS.setHScale:
            state.text.hScale = args[0] / 100
            break
          case OPS.setLeading:
            state.text.leading = args[0]
            break
          case OPS.setTextRise:
            state.text.rise = args[0]
            break
          case OPS.setTextMatrix:
            line = text = [...args[0]] as Matrix
            break
          case OPS.moveText:
            moveLine(args[0], args[1])
            break
          case OPS.setLeadingMoveText:
            state.text.leading = -args[1]
            moveLine(args[0], args[1])
            break
          case OPS.nextLine:
            moveLine(0, -state.text.leading)
            break
          case OPS.showText: {
            const t = state.text
            for (const glyph of args[0]) {
              if (typeof glyph === 'number') {
                // A TJ adjustment, in thousandths of the font size.
                text = multiply([1, 0, 0, 1, (-glyph / 1000) * t.size * t.hScale, 0], text)
                continue
              }
              const advance = (glyph.width / 1000) * t.size
              const toPage = multiply(text, state.ctm)
              glyphs.push({
                font: t.font,
                code: glyph.originalCharCode,
                unicode: glyph.unicode,
                box: boxOf([
                  apply(toPage, [0, t.rise + t.descent * t.size]),
                  apply(toPage, [advance * t.hScale, t.rise + t.ascent * t.size]),
                ]),
              })
              const spacing = t.charSpacing + (glyph.unicode === ' ' ? t.wordSpacing : 0)
              text = multiply([1, 0, 0, 1, (advance + spacing) * t.hScale, 0], text)
            }
            break
          }
          case OPS.constructPath: {
            const [paint, [data]] = args
            if (!data || !(STROKES.has(paint) || FILLS.has(paint))) break
            const scale = Math.hypot(state.ctm[0], state.ctm[1])
            paths.push({
              commands: readPath(data, state.ctm),
              stroke: STROKES.has(paint),
              fill: FILLS.has(paint),
              lineWidth: state.lineWidth * scale,
            })
            break
          }
        }
      })
      pages.push({ glyphs, paths })
      page.cleanup()
    }
    return pages
  } finally {
    await loading.destroy()
  }
}
