import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createIdentityFromHash,
  formatOklch,
  isInSrgbGamut,
  maxChroma,
  type OklchColor,
  TEXT_STYLES,
  type TextColor,
} from '../src/core/color'
import { contrastWithText, oklchToSrgb } from './helpers/color'

const NAMES = Array.from({ length: 200 }, (_, i) => `project-${i}`)

/** 测试内的 Node 端便捷函数，与包主入口的 createIdentityColor 等价 */
const createIdentityColor = (name: string, textColor: TextColor = 'light') =>
  createIdentityFromHash(createHash('sha256').update(name).digest(), textColor).color

describe('createIdentityColor', () => {
  it('同名稳定：同一个项目永远是同一个颜色', () => {
    expect(createIdentityColor('复发性流产专科病历')).toEqual(
      createIdentityColor('复发性流产专科病历')
    )
  })

  it('不同名字的色相铺开，不会挤在一起', () => {
    const buckets = new Array(12).fill(0)
    for (const name of NAMES) {
      buckets[Math.floor(createIdentityColor(name).hue / 30)] += 1
    }
    expect(buckets.every((count) => count > 0)).toBe(true)
  })

  it('亮度落在文字色预设的范围内', () => {
    for (const textColor of ['light', 'dark'] as const) {
      const [min, max] = TEXT_STYLES[textColor].lightness
      for (const name of NAMES) {
        const { lightness } = createIdentityColor(name, textColor)
        expect(lightness).toBeGreaterThanOrEqual(min)
        expect(lightness).toBeLessThanOrEqual(max)
      }
    }
  })

  it('彩度取到色域边界附近——比固定一个小彩度鲜艳得多', () => {
    const chromas = NAMES.map((name) => createIdentityColor(name).chroma)
    const median = [...chromas].sort((a, b) => a - b)[Math.floor(chromas.length / 2)]
    expect(median).toBeGreaterThan(0.1)
    expect(Math.max(...chromas)).toBeGreaterThan(0.2)
  })

  it('颜色完整落在 sRGB 色域内，浏览器不会裁切它', () => {
    for (const name of NAMES) {
      expect(isInSrgbGamut(createIdentityColor(name, 'light'))).toBe(true)
      expect(isInSrgbGamut(createIdentityColor(name, 'dark'))).toBe(true)
    }
  })
})

describe('对比度契约', () => {
  // 这是整个方案的核心保证：亮度范围写死 + 彩度卡在色域内 ⇒ 对比度有下界
  it.each(['light', 'dark'] as const)('%s 预设下穷举所有色相都不低于 4.5:1', (textColor) => {
    const [min, max] = TEXT_STYLES[textColor].lightness
    let worst = Number.POSITIVE_INFINITY
    let worstAt: OklchColor = { lightness: 0, chroma: 0, hue: 0 }

    for (const lightness of [min, (min + max) / 2, max]) {
      for (let hue = 0; hue < 360; hue++) {
        const color: OklchColor = { lightness, chroma: maxChroma(lightness, hue) * 0.99, hue }
        const ratio = contrastWithText(color, textColor)
        if (ratio < worst) {
          worst = ratio
          worstAt = color
        }
      }
    }

    expect(
      worst,
      `最差 ${worst.toFixed(2)}:1 出现在 ${formatOklch(worstAt)}`
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe('oklchToSrgb', () => {
  it('色域内的颜色在两端都不贴边', () => {
    for (const name of NAMES) {
      const rgb = oklchToSrgb(createIdentityColor(name))
      expect(rgb.every((channel) => channel >= 0 && channel <= 255)).toBe(true)
    }
  })

  it('灰色：L=0.5 大致对应中灰', () => {
    const rgb = oklchToSrgb({ lightness: 0.5, chroma: 0, hue: 0 })
    expect(rgb[0]).toBe(rgb[1])
    expect(rgb[1]).toBe(rgb[2])
    expect(rgb[0]).toBeGreaterThan(90)
    expect(rgb[0]).toBeLessThan(160)
  })
})

describe('formatOklch', () => {
  it('输出可被 CSS 解析的颜色字面量', () => {
    expect(formatOklch({ lightness: 0.4842, chroma: 0.1634, hue: 256 })).toBe(
      'oklch(0.484 0.163 256)'
    )
  })
})
