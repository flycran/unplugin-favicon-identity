import { describe, expect, it } from 'vitest'
import { buildFaviconSvg, escapeXml } from '../src/core'

describe('escapeXml', () => {
  it('转义 XML 特殊字符', () => {
    expect(escapeXml('&')).toBe('&amp;')
    expect(escapeXml('<')).toBe('&lt;')
    expect(escapeXml('a&b<c>"d"\'e\'')).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;')
  })

  it('普通文字原样保留', () => {
    expect(escapeXml('复A1')).toBe('复A1')
  })
})

describe('buildFaviconSvg', () => {
  it('生成完整的 SVG，含底色与居中文字', () => {
    const svg = buildFaviconSvg({
      char: '复',
      background: 'oklch(0.5 0.1 200)',
      foreground: '#ffffff',
    })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('fill="oklch(0.5 0.1 200)"')
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('>复</text>')
    expect(svg).toContain('rx="14"')
  })

  it('特殊字符被转义，不会破坏文本节点', () => {
    const svg = buildFaviconSvg({ char: '&', background: '#000000', foreground: '#ffffff' })
    expect(svg).toContain('>&amp;</text>')
    expect(svg).not.toContain('>&</text>')

    const angle = buildFaviconSvg({ char: '<', background: '#000000', foreground: '#ffffff' })
    expect(angle).toContain('>&lt;</text>')
  })
})
