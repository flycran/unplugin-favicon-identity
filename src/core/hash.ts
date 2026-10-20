/**
 * SHA-256 摘要的用途划分（共 8 个 32 位字）
 *
 * word 0    色相
 * word 1-3  预留：色相相关扩展
 * word 4    亮度
 * word 5-6  预留：亮度相关扩展
 * word 7    版本号（dev 的 ?v=，只用于破缓存）
 *
 * 位置一旦确定就不要再挪：以后新增参数只能占用预留字，否则所有已有名字的颜色都会漂移。
 * 32 位对一个映射绰绰有余（色相只需 360 个值），留三位给后续扩展足够。
 */
const HUE_WORD = 0
const LIGHTNESS_WORD = 4
const VERSION_WORD = 7

/** 32 位无符号整数的取值范围，用于把摘要字归一化到 [0, 1) */
const UINT32_RANGE = 2 ** 32

export interface IdentityHash {
  /** 色相来源，[0, 1) */
  hueRatio: number
  /** 亮度来源，[0, 1) */
  lightnessRatio: number
  /** 版本号，8 位十六进制 */
  version: string
}

/**
 * 从已算好的 SHA-256 摘要中取出颜色与版本号所需的三个值
 *
 * core 不负责哈希本身：Node 入口用 node:crypto，浏览器用 Web Crypto，
 * 两边把同样的 32 字节交给这里，结果完全一致。
 */
export function readIdentityHash(digest: Uint8Array): IdentityHash {
  if (digest.length < 32) {
    throw new Error(`SHA-256 digest must be 32 bytes, got ${digest.length}`)
  }

  // Uint8Array 没有 readUInt32BE，DataView 是标准库里的等价替代（默认大端）
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
  const versionOffset = VERSION_WORD * 4
  const version = Array.from(digest.subarray(versionOffset, versionOffset + 4), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')

  return {
    hueRatio: view.getUint32(HUE_WORD * 4) / UINT32_RANGE,
    lightnessRatio: view.getUint32(LIGHTNESS_WORD * 4) / UINT32_RANGE,
    version,
  }
}
