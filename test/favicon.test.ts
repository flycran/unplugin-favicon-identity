import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createFavicon } from '../src'
import { createFaviconFromHash } from '../src/web'

const sha256 = (input: string) => createHash('sha256').update(input).digest()

describe('createFaviconFromHash', () => {
  it('与 Node 入口对同一名字产出一致', () => {
    const name = 'Outpatient Portal'
    expect(createFaviconFromHash({ text: name, hash: sha256(name) })).toEqual(createFavicon(name))
    expect(createFavicon(name).svg).toContain('>O<')
  })

  it('接受 ArrayBuffer', () => {
    const name = 'demo'
    const bytes = new Uint8Array(sha256(name))
    expect(createFaviconFromHash({ text: name, hash: bytes.buffer })).toEqual(
      createFaviconFromHash({ text: name, hash: bytes })
    )
  })

  it('摘要不足 32 字节时报错', () => {
    expect(() => createFaviconFromHash({ text: 'demo', hash: new Uint8Array(8) })).toThrow(
      /32 bytes/
    )
  })
})
