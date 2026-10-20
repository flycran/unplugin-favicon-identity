import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities, extractTitle, firstChar } from '../src/core/name'

describe('decodeHtmlEntities', () => {
  it('还原命名实体', () => {
    expect(decodeHtmlEntities('A &amp; B')).toBe('A & B')
    expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>')
  })

  it('还原数字实体（十进制与十六进制）', () => {
    expect(decodeHtmlEntities('&#39;quoted&#39;')).toBe("'quoted'")
    expect(decodeHtmlEntities('&#x4e2d;&#x6587;')).toBe('中文')
  })

  it('不认识的实体原样保留', () => {
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;')
  })
})

describe('extractTitle', () => {
  it('取出标题并解码实体', () => {
    expect(extractTitle('<title>复发性流产专科病历</title>')).toBe('复发性流产专科病历')
    expect(extractTitle('<title>R&amp;D Console</title>')).toBe('R&D Console')
  })

  it('忽略标题内外的空白', () => {
    expect(extractTitle('<title>\n  门诊系统  \n</title>')).toBe('门诊系统')
  })

  it('没有可用标题时返回 undefined', () => {
    expect(extractTitle('<html><body></body></html>')).toBeUndefined()
    expect(extractTitle('<title>   </title>')).toBeUndefined()
  })
})

describe('firstChar', () => {
  it('取首个字符', () => {
    expect(firstChar('复发性流产')).toBe('复')
    expect(firstChar('rmemr')).toBe('r')
  })

  it('emoji 的组合序列不会被拆散', () => {
    const family = '👨\u200d👩\u200d👧'
    expect(firstChar(`${family} 家庭`)).toBe(family)
    expect(firstChar('👍\u{1F3FD} 点赞')).toBe('👍\u{1F3FD}')
  })

  it('跳过首尾空白', () => {
    expect(firstChar('  空格开头')).toBe('空')
  })

  it('空名字有兜底字符', () => {
    expect(firstChar('')).toBe('?')
    expect(firstChar('   ')).toBe('?')
  })
})
