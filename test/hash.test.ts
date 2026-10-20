import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readIdentityHash } from '../src/core/hash'

const digest = (input: string) => createHash('sha256').update(input).digest()

describe('readIdentityHash', () => {
  it('word 0 作色相、word 4 作亮度、word 7 作版本', () => {
    const bytes = digest('demo')
    expect(readIdentityHash(bytes)).toEqual({
      hueRatio: bytes.readUInt32BE(0) / 2 ** 32,
      lightnessRatio: bytes.readUInt32BE(16) / 2 ** 32,
      version: bytes.subarray(28, 32).toString('hex'),
    })
  })

  it('同一摘要每次得到相同结果', () => {
    const bytes = digest('门诊随访系统')
    expect(readIdentityHash(bytes)).toEqual(readIdentityHash(bytes))
  })

  it('摘要不足 32 字节时报错', () => {
    expect(() => readIdentityHash(new Uint8Array(8))).toThrow(/32 bytes/)
  })
})
