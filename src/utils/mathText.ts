// KaTeX and its DOM-oriented assets are excluded from Mini Program builds.
// #ifdef H5
import katex from 'katex'
// #endif

export interface MathTextSegment {
  kind: 'text' | 'math'
  content: string
  raw: string
  display: boolean
}

const MAX_SOURCE = 50_000
const MAX_FORMULA = 5_000
const MAX_FORMULAS = 64
const MAX_CANDIDATES = 128

export function escapeMathText(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function escaped(text: string, index: number): boolean {
  let slashes = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) slashes++
  return slashes % 2 === 1
}

function closeAt(text: string, start: number, close: string, dollar = false): number {
  let cursor = start
  while ((cursor = text.indexOf(close, cursor)) >= 0) {
    if (!escaped(text, cursor) && (!dollar || (text[cursor - 1] !== '$' && text[cursor + 1] !== '$' && !/\s/.test(text[cursor - 1] || '') && !/\d/.test(text[cursor + 1] || '')))) return cursor
    cursor += close.length
  }
  return -1
}

function containsDollar(text: string): boolean {
  for (let cursor = 0; cursor < text.length; cursor++) if (text[cursor] === '$' && !escaped(text, cursor)) return true
  return false
}

function groupEnd(text: string, start: number, open = '{', close = '}'): number {
  if (text[start] !== open) return -1
  let depth = 0
  for (let cursor = start; cursor < Math.min(text.length, start + MAX_FORMULA); cursor++) {
    if (text[cursor] === '\\') { cursor++; continue }
    if (text[cursor] === open) { if (++depth > 32) return -1 }
    else if (text[cursor] === close && --depth === 0) return cursor + 1
  }
  return -1
}

// Recognize only complete, unambiguous command groups in older unwrapped data.
// Prose, prices and plain x/y notation are never guessed to be mathematics.
function bareFormulaEnd(text: string, start: number): number {
  const command = /^(?:\\(?:dfrac|tfrac|frac)|\\sqrt)(?![A-Za-z])/.exec(text.slice(start))?.[0]
  if (!command) return -1
  let end = start + command.length
  while (/\s/.test(text[end] || '') && text[end] !== '\n') end++
  if (command === '\\sqrt' && text[end] === '[') {
    end = groupEnd(text, end, '[', ']')
    if (end < 0) return -1
    while (/\s/.test(text[end] || '') && text[end] !== '\n') end++
  }
  end = groupEnd(text, end)
  if (end < 0) return -1
  if (command !== '\\sqrt') {
    while (/\s/.test(text[end] || '') && text[end] !== '\n') end++
    end = groupEnd(text, end)
  }
  return end
}

export function tokenizeMathText(text: string): MathTextSegment[] {
  if (!text || text.length > MAX_SOURCE) return [{ kind: 'text', content: text, raw: text, display: false }]
  const segments: MathTextSegment[] = []
  let plainStart = 0, cursor = 0, formulaCount = 0, candidates = 0
  function appendMath(start: number, end: number, content: string, display: boolean) {
    if (start > plainStart) segments.push({ kind: 'text', content: text.slice(plainStart, start), raw: text.slice(plainStart, start), display: false })
    segments.push({ kind: 'math', content, raw: text.slice(start, end), display })
    plainStart = end; cursor = end; formulaCount++
  }
  while (cursor < text.length && formulaCount < MAX_FORMULAS && candidates < MAX_CANDIDATES) {
    if (text[cursor] === '\\' && text[cursor + 1] === '\\') { cursor += 2; continue }
    if (escaped(text, cursor)) { cursor++; continue }
    let open = '', close = '', display = false, dollar = false
    if (text.startsWith('\\[', cursor)) { open = '\\['; close = '\\]'; display = true }
    else if (text.startsWith('\\(', cursor)) { open = '\\('; close = '\\)' }
    else if (text.startsWith('$$', cursor)) { open = '$$'; close = '$$'; display = true }
    else if (text[cursor] === '$' && text[cursor - 1] !== '$' && text[cursor + 1] !== '$' && text[cursor + 1] && !/\s/.test(text[cursor + 1])) { open = '$'; close = '$'; dollar = true }
    if (open) {
      candidates++
      const closeIndex = closeAt(text, cursor + open.length, close, dollar)
      if (closeIndex >= 0) {
        const content = text.slice(cursor + open.length, closeIndex)
        if (content.trim() && content.length <= MAX_FORMULA && (!dollar || (!content.includes('\n') && !containsDollar(content)))) {
          appendMath(cursor, closeIndex + close.length, content, display)
          continue
        }
      }
      // Incomplete streaming tokens stay entirely readable, including delimiters.
      if (closeIndex < 0 && !dollar) break
      cursor += open.length
      continue
    }
    if (text[cursor] === '\\') {
      candidates++
      const end = bareFormulaEnd(text, cursor)
      if (end > cursor) { appendMath(cursor, end, text.slice(cursor, end), false); continue }
    }
    cursor++
  }
  if (plainStart < text.length) segments.push({ kind: 'text', content: text.slice(plainStart), raw: text.slice(plainStart), display: false })
  return segments
}

// #ifdef H5
export function renderMathText(text: string, inline = false): string {
  return tokenizeMathText(text).map(segment => {
    if (segment.kind === 'text') return `<span class="math-plain">${escapeMathText(segment.content)}</span>`
    try {
      const html = katex.renderToString(segment.content, {
        displayMode: segment.display && !inline,
        output: 'htmlAndMathml',
        trust: false,
        strict: 'ignore',
        throwOnError: false,
        errorColor: '#78816f',
        maxExpand: 128,
        maxSize: 8,
        macros: {},
      })
      if (html.includes('class="katex-error"')) return `<span class="math-fallback">${escapeMathText(segment.raw)}</span>`
      return `<span class="${segment.display && !inline ? 'math-block' : 'math-run'}">${html}</span>`
    } catch {
      return `<span class="math-fallback">${escapeMathText(segment.raw)}</span>`
    }
  }).join('')
}
// #endif

const symbols: Record<string, string> = {
  '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\pm': '±', '\\mp': '∓', '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠',
  '\\approx': '≈', '\\equiv': '≡', '\\pi': 'π', '\\theta': 'θ', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\Delta': 'Δ', '\\infty': '∞', '\\rightarrow': '→', '\\to': '→',
}

function readableMath(formula: string): string {
  let output = formula
  // Small bounded passes improve common fractions without pretending to be TeX.
  for (let pass = 0; pass < 5; pass++) {
    const before = output
    output = output.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$1')
    if (before === output) break
  }
  return output.replace(/\\[A-Za-z]+/g, command => symbols[command] ?? (command === '\\left' || command === '\\right' ? '' : command))
    .replace(/\\[,;!]/g, ' ').replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/_\{([^{}]*)\}/g, '_($1)')
}

/** Mini Program fallback; the persisted source is never changed. */
export function plainMathText(text: string): string {
  return tokenizeMathText(text).map(segment => segment.kind === 'text' ? segment.content : `${segment.display ? '\n' : ''}${readableMath(segment.content)}${segment.display ? '\n' : ''}`).join('')
}
