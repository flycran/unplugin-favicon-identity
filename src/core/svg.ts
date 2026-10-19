/** 图标画布与文字的尺寸 */
export const ICON_SIZE = 64
/** 圆角矩形底色的圆角半径，约 22% 边长：小尺寸下仍能看出是圆角方形而不是圆形 */
export const CORNER_RADIUS = 14
export const FONT_SIZE = 44

const FONT_FAMILY =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** 传给 render 的渲染数据 */
export interface FaviconRenderData {
  /** 图标文字，名字的首个字符 */
  char: string
  /** 背景色 */
  background: string
  /** 文字色，由 textColor 预设决定 */
  foreground: string
}

/** 字符 → XML 实体，用于把文字安全地放进 SVG 的文本节点 */
const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char)
}

/** 内置模板：圆角底色 + 居中的首字 */
export function buildFaviconSvg({ char, background, foreground }: FaviconRenderData): string {
  const center = ICON_SIZE / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">
  <rect width="${ICON_SIZE}" height="${ICON_SIZE}" rx="${CORNER_RADIUS}" fill="${background}"/>
  <text x="${center}" y="${center}" fill="${foreground}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(char)}</text>
</svg>`
}
