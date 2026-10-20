import {
  createIdentityFromHash,
  formatOklch,
  type OklchColor,
  TEXT_STYLES,
  type TextColor,
} from './core/color'
import { firstChar } from './core/name'
import { buildFaviconSvg, escapeXml, type FaviconRenderData } from './core/svg'

export type { OklchColor, TextColor } from './core/color'
export type { FaviconRenderData } from './core/svg'
export { buildFaviconSvg, escapeXml, formatOklch }

/** 生成图标时与运行时无关的配置 */
export interface FaviconOptions {
  /** 文字色预设，只提供浅色与深色两种，缺省 light */
  textColor?: TextColor
  /** 背景色（任意 CSS 颜色，如 oklch(0.5 0.1 200) / #rrggbb）；缺省由摘要生成 */
  bgColor?: string
  /** 自定义模板：接收渲染数据，返回完整的 SVG 字符串；缺省用内置模板 */
  render?: (data: FaviconRenderData) => string
}

export interface FaviconFromHashOptions extends FaviconOptions {
  /** 项目名，用于取首个字素 */
  text: string
  /** `text` 的 SHA-256 摘要，32 字节 */
  hash: Uint8Array | ArrayBuffer
}

export interface Favicon {
  /** 最终 SVG */
  svg: string
  /** 实际使用的背景色 */
  background: string
  /** 生成的身份色 */
  color: OklchColor
  /** 名字派生的版本号，8 位十六进制 */
  version: string
}

/**
 * 由已算好的 SHA-256 摘要生成图标
 *
 * 不依赖任何运行时 API，浏览器与 Node 都能用。调用方负责把 `text` 的 UTF-8 字节
 * 做 SHA-256；浏览器里就是 `crypto.subtle.digest('SHA-256', ...)`。
 */
export function createFaviconFromHash({
  text,
  hash,
  textColor = 'light',
  bgColor,
  render = buildFaviconSvg,
}: FaviconFromHashOptions): Favicon {
  const digest = hash instanceof Uint8Array ? hash : new Uint8Array(hash)
  const { color, version } = createIdentityFromHash(digest, textColor)
  const background = bgColor ?? formatOklch(color)
  const svg = render({
    char: firstChar(text),
    background,
    foreground: TEXT_STYLES[textColor].color,
  })

  return { svg, background, color, version }
}
