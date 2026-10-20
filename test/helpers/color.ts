import {
  type OklchColor,
  oklabToLinearRgb,
  type Rgb,
  TEXT_STYLES,
  type TextColor,
} from '../../src/core/color'

/**
 * 测试专用的对比度计算
 *
 * 这些函数只用来独立校验「颜色契约」是否成立，不属于发布实现，也不对外导出。
 */

function encodeSrgb(value: number): number {
  const v = Math.min(1, Math.max(0, value))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

/** OKLCH → sRGB（0 ~ 255）；超色域的分量按浏览器的方式裁到 [0, 1] */
export function oklchToSrgb(color: OklchColor): Rgb {
  const angle = (color.hue * Math.PI) / 180
  const linear = oklabToLinearRgb(
    color.lightness,
    color.chroma * Math.cos(angle),
    color.chroma * Math.sin(angle)
  )
  return linear.map((value) => Math.round(encodeSrgb(value) * 255)) as Rgb
}

function toLinear(channel: number): number {
  const v = channel / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** WCAG 相对亮度 */
function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 对比度，取值 1 ~ 21 */
function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** 该背景色与预设文字色之间的对比度 */
export function contrastWithText(color: OklchColor, textColor: TextColor): number {
  const background = relativeLuminance(oklchToSrgb(color))
  const foreground = relativeLuminance(hexToRgb(TEXT_STYLES[textColor].color))
  return contrastRatio(background, foreground)
}
