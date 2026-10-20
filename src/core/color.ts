import { readIdentityHash } from './hash'

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
 * 由已算好的 SHA-256 摘要生成颜色与版本号
 *
 * 彩度卡在 sRGB 色域内：超出时浏览器会把 linear 分量裁到 [0, 1]，亮度会跟着漂
 * （实测请求 L=0.53 能渲染成 0.68），那样 L 就管不住对比度了。取域内上限既能拿到
 * 该色相最鲜艳的颜色，又不会漂。
 */
export function createIdentityFromHash(
  hash: Uint8Array,
  textColor: TextColor = 'light'
): { color: OklchColor; version: string } {
  const [minLightness, maxLightness] = TEXT_STYLES[textColor].lightness
  const { hueRatio, lightnessRatio, version } = readIdentityHash(hash)
  const hue = Math.floor(hueRatio * 360)
  const lightness = minLightness + (maxLightness - minLightness) * lightnessRatio
  const chroma = Math.floor(maxChroma(lightness, hue) * 0.99 * 1000) / 1000
  return { color: { lightness, chroma, hue }, version }
}

/** 输出 CSS 颜色字面量，例如 oklch(0.484 0.163 256) */
export function formatOklch({ lightness, chroma, hue }: OklchColor): string {
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue})`
}
