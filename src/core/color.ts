import { createHash } from 'node:crypto'

/**
 * 文字色预设：文字颜色 + 背景允许的亮度范围（OKLab 的 L，也就是感知亮度）
 *
 * OKLab 的 L 定死就等于对比度定死，所以这里的范围是写死的常量而不是运行期算出来的。
 * 两组范围是穷举 360 个色相（彩度取色域内最大值）后的最差情况：
 * light 白字配 L 0.48 ~ 0.53 的背景，对比度 5.20:1 起
 * dark 黑字配 L 0.64 ~ 0.75 的背景，对比度 4.76:1 起
 */
export const TEXT_STYLES = {
  light: { color: '#ffffff', lightness: [0.48, 0.53] },
  dark: { color: '#111111', lightness: [0.64, 0.75] },
} satisfies Record<string, { color: string; lightness: [number, number] }>

export type TextColor = keyof typeof TEXT_STYLES

export type Rgb = [number, number, number]

/** OKLCH 的三个分量 */
export interface OklchColor {
  /** 感知亮度，0 ~ 1 */
  lightness: number
  /** 彩度，0 即灰色 */
  chroma: number
  /** 色相角度，0 ~ 360 */
  hue: number
}

/**
 * 把字符串映射到 [0, 1) 的小数
 * salt 用于在同一名字上取到多个互不相关的小数（色相与亮度各需要一个小数）
 */
export function hashRatio(input: string, salt = ''): number {
  const digest = createHash('sha256').update(`${input}\u0000${salt}`).digest()
  return digest.readUInt32BE(0) / 2 ** 32
}

/** 十六进制摘要，用于给生成的资源标记版本 */
export function hashString(input: string, length = 8): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length)
}

/** OKLab → linear sRGB */
export function oklabToLinearRgb(lightness: number, a: number, b: number): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/**
 * 该亮度、该色相下 sRGB 能表示的最大彩度（色域边界）
 *
 * 二分 16 次的误差是 1e-5，而彩度只输出到小数后 3 位；二分又始终向下收敛，结果必定落在色域内。
 * 各色相差别很大：同一亮度下青色只有 0.09 左右，品红能到 0.29。
 */
export function maxChroma(lightness: number, hue: number): number {
  const angle = (hue * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  let low = 0
  let high = 1
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2
    const [r, g, b] = oklabToLinearRgb(lightness, mid * cosine, mid * sine)
    if (r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1) low = mid
    else high = mid
  }
  return low
}

/** 该颜色是否完整落在 sRGB 色域内；落在域内时浏览器不会做任何裁切，亮度与色相都如实呈现 */
export function isInSrgbGamut({ lightness, chroma, hue }: OklchColor): boolean {
  const angle = (hue * Math.PI) / 180
  const [r, g, b] = oklabToLinearRgb(lightness, chroma * Math.cos(angle), chroma * Math.sin(angle))
  return r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1
}

/**
 * 由名字生成身份色：色相与亮度各取一个哈希小数，彩度取该色相在 sRGB 内的上限
 *
 * 为什么彩度要卡在色域内：超出 sRGB 时浏览器会把 linear 分量直接裁到 [0, 1]，亮度会跟着漂
 * （实测请求 L=0.53 能渲染成 0.68），那样 L 就管不住对比度了。取色域内的上限既能拿到该色相
 * 最鲜艳的颜色，又不会漂。
 */
export function createIdentityColor(name: string, textColor: TextColor = 'light'): OklchColor {
  const [minLightness, maxLightness] = TEXT_STYLES[textColor].lightness
  const hue = Math.floor(hashRatio(name) * 360)
  const lightness = minLightness + (maxLightness - minLightness) * hashRatio(name, 'lightness')
  const chroma = Math.floor(maxChroma(lightness, hue) * 0.99 * 1000) / 1000
  return { lightness, chroma, hue }
}

/** 输出 CSS 颜色字面量，例如 oklch(0.484 0.163 256) */
export function formatOklch({ lightness, chroma, hue }: OklchColor): string {
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue})`
}

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
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 对比度，取值 1 ~ 21 */
export function contrastRatio(a: number, b: number): number {
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
