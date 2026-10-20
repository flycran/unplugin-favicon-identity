import { useEffect, useMemo, useState } from 'react'
import { createFaviconFromHash, type TextColor } from '../../src/web'

const SAMPLE_NAMES = ['门诊随访系统', 'Outpatient Portal', 'PACS Workstation', 'Inpatient Records']

const ICON_SIZES = [16, 24, 32, 48]

const PANEL =
  'rounded-[18px] border border-white/10 bg-gradient-to-b from-white/5 to-white/[0.02] p-[22px] backdrop-blur-md max-[520px]:p-[18px]'
const LABEL = 'text-[13px] font-semibold text-slate-400'
const INPUT =
  'w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-inherit outline-none transition focus:border-sky-300/60 focus:ring-[3px] focus:ring-sky-400/10'
const SEGMENT = 'rounded-[9px] px-2.5 py-2.5 transition'
const SEGMENT_ACTIVE = 'bg-sky-300/15 text-sky-300 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.25)]'
const SEGMENT_IDLE = 'bg-transparent text-slate-400'
const CHIP = 'rounded-full border px-3 py-1.5 text-xs transition'
const CHIP_IDLE =
  'border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-300/45 hover:bg-sky-400/[0.08] hover:text-sky-300'
const CHIP_ACTIVE = 'border-sky-300/45 bg-sky-400/[0.08] text-sky-300'
const CODE = 'font-mono text-[13px] text-sky-100'

/** 浏览器自带 Web Crypto：SHA-256 算出摘要，剩下的交给纯函数 */
async function sha256(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return new Uint8Array(digest)
}

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default function App() {
  const [name, setName] = useState('门诊随访系统')
  const [textColor, setTextColor] = useState<TextColor>('light')
  const [bgColor, setBgColor] = useState('')
  const [hash, setHash] = useState<Uint8Array | null>(null)
  const [hashError, setHashError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tabs, setTabs] = useState<Array<{ name: string; svg: string }>>([])

  useEffect(() => {
    let cancelled = false

    if (!globalThis.crypto?.subtle) {
      setHash(null)
      setHashError('当前环境不支持 Web Crypto（需要 HTTPS 或 localhost）')
      return
    }

    sha256(name)
      .then((value) => {
        if (cancelled) return
        setHash(value)
        setHashError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setHash(null)
        setHashError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [name])

  useEffect(() => {
    let cancelled = false
    if (!globalThis.crypto?.subtle) return

    Promise.all(
      SAMPLE_NAMES.map(async (sample) => ({
        name: sample,
        svg: createFaviconFromHash({ text: sample, hash: await sha256(sample) }).svg,
      }))
    ).then((value) => {
      if (!cancelled) setTabs(value)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const trimmedBg = bgColor.trim()
  const bgValid = trimmedBg === '' || CSS.supports('color', trimmedBg)

  const favicon = useMemo(() => {
    if (!hash) return null
    return createFaviconFromHash({
      text: name,
      hash,
      textColor,
      bgColor: bgValid && trimmedBg ? trimmedBg : undefined,
    })
  }, [hash, name, textColor, bgValid, trimmedBg])

  const dataUrl = favicon ? svgUrl(favicon.svg) : null

  async function copySvg() {
    if (!favicon) return
    try {
      await navigator.clipboard.writeText(favicon.svg)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setHashError('复制失败，请手动选择下方 SVG 文本')
    }
  }

  function downloadSvg() {
    if (!favicon) return
    const blob = new Blob([favicon.svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${name.trim() || 'favicon'}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1120px] flex-col gap-5 px-5 pt-14 pb-10 max-[860px]:pt-9 max-[520px]:px-3">
      <header className="max-w-[720px]">
        <span className="inline-flex items-center rounded-full border border-sky-300/25 bg-sky-400/[0.08] px-2.5 py-1 text-xs tracking-[0.06em] text-sky-300 uppercase">
          unplugin-favicon-identity
        </span>
        <h1 className="mt-[18px] mb-3 text-[clamp(32px,5vw,52px)] leading-[1.05] tracking-[-0.03em]">
          给每个项目一枚自己的图标
        </h1>
        <p className="m-0 leading-[1.7] text-slate-400">
          输入项目名，颜色与首字实时生成。同名永远同色，颜色始终落在 sRGB 色域内，
          文字对比度由测试保证。
        </p>
      </header>

      <main className="grid items-stretch gap-5 min-[860px]:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <section className={`${PANEL} flex flex-col gap-5`} aria-label="参数">
          <label className="flex flex-col gap-2">
            <span className={LABEL}>项目名</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：门诊随访系统"
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          </label>

          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className={`p-0 ${LABEL}`}>文字色</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                className={`${SEGMENT} ${textColor === 'light' ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
                onClick={() => setTextColor('light')}
              >
                浅色文字
              </button>
              <button
                type="button"
                className={`${SEGMENT} ${textColor === 'dark' ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
                onClick={() => setTextColor('dark')}
              >
                深色文字
              </button>
            </div>
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className={LABEL}>
              自定义背景色 <em className="ml-1 font-normal text-slate-500 not-italic">可选</em>
            </span>
            <input
              value={bgColor}
              onChange={(event) => setBgColor(event.target.value)}
              placeholder="留空则按名字生成，例如 #2563eb"
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          </label>
          {!bgValid && (
            <p className="m-0 text-[13px] text-amber-300">无法识别的 CSS 颜色，已忽略。</p>
          )}

          <div className="flex flex-col gap-2">
            <span className={LABEL}>试试这些名字</span>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_NAMES.map((sample) => (
                <button
                  type="button"
                  key={sample}
                  className={`${CHIP} ${sample === name ? CHIP_ACTIVE : CHIP_IDLE}`}
                  onClick={() => setName(sample)}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          className={`${PANEL} flex min-h-[360px] flex-col justify-center gap-[26px] max-[860px]:min-h-0`}
          aria-label="预览"
        >
          {favicon && dataUrl ? (
            <>
              <div className="flex flex-wrap items-center gap-7 max-[520px]:gap-5">
                <img
                  className="h-40 w-40 rounded-[28px] shadow-[0_24px_60px_rgba(0,0,0,0.45)] max-[520px]:h-[120px] max-[520px]:w-[120px] max-[520px]:rounded-[22px]"
                  src={dataUrl}
                  width={160}
                  height={160}
                  alt={`${name} 的图标`}
                />
                <dl className="m-0 grid grid-cols-[repeat(2,minmax(120px,1fr))] gap-x-[26px] gap-y-3.5">
                  <div className="flex flex-col gap-1">
                    <dt className="text-xs text-slate-400">背景色</dt>
                    <dd className="m-0">
                      <code className={CODE}>{favicon.background}</code>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-xs text-slate-400">色相</dt>
                    <dd className="m-0">
                      <code className={CODE}>{favicon.color.hue}°</code>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-xs text-slate-400">亮度</dt>
                    <dd className="m-0">
                      <code className={CODE}>{favicon.color.lightness.toFixed(3)}</code>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-xs text-slate-400">版本</dt>
                    <dd className="m-0">
                      <code className={CODE}>{favicon.version}</code>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex items-end gap-6 border-t border-dashed border-white/10 pt-5">
                {ICON_SIZES.map((size) => (
                  <figure key={size} className="m-0 flex flex-col items-center gap-2">
                    <img src={dataUrl} width={size} height={size} alt="" />
                    <figcaption className="text-[11px] text-slate-400">{size}px</figcaption>
                  </figure>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-slate-400">计算中…</p>
          )}
          {hashError && <p className="m-0 text-[13px] text-amber-300">{hashError}</p>}
        </section>
      </main>

      <section className={PANEL} aria-label="标签页对比">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-[17px] tracking-[-0.01em]">标签页对比</h2>
            <p className="mt-1.5 mb-0 text-[13px] text-slate-400">
              同一个名字永远是同一个颜色，不同项目一眼区分。
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-black/30 px-2.5 pt-2.5">
          {tabs.map((tab) => (
            <div
              className="flex items-center gap-2 rounded-t-[10px] border border-b-0 border-white/10 bg-[#171b24] px-4 py-2.5 text-[13px] whitespace-nowrap text-slate-200"
              key={tab.name}
            >
              <img className="block" src={svgUrl(tab.svg)} width={16} height={16} alt="" />
              <span>{tab.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={PANEL} aria-label="SVG 输出">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="m-0 text-[17px] tracking-[-0.01em]">SVG</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-[10px] border border-sky-300/30 bg-sky-300/10 px-3.5 py-2 text-sky-300 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={copySvg}
              disabled={!favicon}
            >
              {copied ? '已复制' : '复制 SVG'}
            </button>
            <button
              type="button"
              className="rounded-[10px] border border-sky-300/30 bg-sky-300/10 px-3.5 py-2 text-sky-300 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={downloadSvg}
              disabled={!favicon}
            >
              下载
            </button>
          </div>
        </div>
        <pre className="m-0 max-h-[340px] overflow-auto rounded-xl border border-white/10 bg-black/35 p-4">
          <code className="font-mono text-[13px] leading-[1.6] break-words whitespace-pre-wrap text-sky-100">
            {favicon?.svg ?? ''}
          </code>
        </pre>
      </section>

      <footer className="flex justify-between gap-4 px-1 py-2 text-xs text-slate-400">
        <span>SHA-256 → OKLCH · 无随机数 · 无缓存</span>
        <a
          className="text-sky-300 no-underline hover:underline"
          href="https://github.com/flycran/unplugin-favicon-identity"
        >
          GitHub
        </a>
      </footer>
    </div>
  )
}
