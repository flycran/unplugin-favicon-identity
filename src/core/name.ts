/** HTML 实体名 → 字符，用于把 <title> 里的 &amp; 之类还原成真实字符 */
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i

/** 还原 HTML 实体，包括 &#39; / &#x27; 这类数字实体 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#[0-9a-fx]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1]?.toLowerCase() === 'x'
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** 从 HTML 里取 <title> 的文本 */
export function extractTitle(html: string): string | undefined {
  const raw = html.match(TITLE_RE)?.[1]?.trim()
  return raw ? decodeHtmlEntities(raw) : undefined
}

const segmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/**
 * 取名字的首个「字」
 * 用 Intl.Segmenter 按字素簇切分，emoji 的组合序列（ZWJ、肤色修饰符）不会被拆散
 */
export function firstChar(input: string): string {
  const name = input.trim()
  if (!name) return '?'
  if (!segmenter) return [...name][0] ?? '?'
  for (const { segment } of segmenter.segment(name)) return segment
  return '?'
}
