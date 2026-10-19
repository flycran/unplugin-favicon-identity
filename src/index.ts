import fs from 'node:fs/promises'
import path from 'node:path'
import { createUnplugin } from 'unplugin'
import type { FaviconRenderData, TextColor } from './core'
import {
  buildFaviconSvg,
  contrastWithText,
  createIdentityColor,
  escapeXml,
  extractTitle,
  firstChar,
  formatOklch,
  hashString,
  TEXT_STYLES,
} from './core'

export * from './core'

const PLUGIN_NAME = 'unplugin-favicon-identity'

/** 图标资源文件名：各构建工具都输出到产物根目录，dev 时由对应的 dev server 提供 */
const FAVICON_FILE = '__favicon-identity.svg'

const ICON_LINK_RE = /<link\b[^>]*\brel=["']?(?:shortcut\s+)?icon["']?[^>]*>/gi

/** 只取用得到的部分，避免为了类型去依赖 webpack 的声明文件 */
interface CompilerLike {
  options?: {
    context?: string
    output?: { publicPath?: unknown }
  }
  webpack?: {
    Compilation?: { PROCESS_ASSETS_STAGE_SUMMARIZE?: number }
    sources?: { RawSource?: new (source: string) => unknown }
  }
  hooks?: {
    thisCompilation?: {
      tap: (name: string, handler: (compilation: CompilationLike) => void) => void
    }
  }
}

interface CompilationLike {
  getAsset?: (name: string) => { source: { source: () => string | Uint8Array } } | undefined
  updateAsset?: (name: string, source: unknown) => void
  hooks?: {
    processAssets?: {
      tapPromise: (
        options: { name: string; stage?: number },
        handler: (assets: Record<string, unknown>) => Promise<void>
      ) => void
    }
  }
}

/** 替换页面里所有 rel="icon"：保留一个，多余的删除；一个都没有就插到 </head> 前 */
function injectIconLink(html: string, href: string): string {
  const link = `<link rel="icon" type="image/svg+xml" href="${escapeXml(href)}" />`
  let inserted = false
  const replaced = html.replace(ICON_LINK_RE, () => {
    if (inserted) return ''
    inserted = true
    return link
  })
  return inserted ? replaced : replaced.replace(/<\/head>/i, `${link}\n</head>`)
}

/** 拼出资源最终 URL：绝对 publicPath 直接用，其余按 HTML 所在目录深度补相对前缀 */
function assetHref(htmlName: string, publicPath: string | undefined, file: string): string {
  const dir = path.posix.dirname(htmlName)
  const depth = dir === '.' ? 0 : dir.split('/').filter(Boolean).length
  const prefix = depth > 0 ? '../'.repeat(depth) : './'

  if (!publicPath || publicPath === 'auto') return `${prefix}${file}`
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(publicPath) || publicPath.startsWith('/')) {
    return publicPath.endsWith('/') ? `${publicPath}${file}` : `${publicPath}/${file}`
  }

  // 相对 publicPath（'./'、'assets/'）同样以 HTML 所在目录为基准
  const normalized = publicPath.replace(/^\.\//, '')
  return `${prefix}${normalized && !normalized.endsWith('/') ? `${normalized}/` : normalized}${file}`
}

export interface FaviconIdentityOptions {
  /** 图标文字，取其首个字符；缺省时读取 index.html 的 <title>，再缺省用 package.json 的 name（都取不到则报错） */
  text?: string
  /** 背景色（任意 CSS 颜色，如 oklch(0.5 0.1 200) / #rrggbb）；缺省时由名字哈希生成 */
  bgColor?: string
  /** 文字色预设，只提供浅色与深色两种，缺省 light */
  textColor?: TextColor
  /** 自定义模板：接收渲染数据，返回完整的 SVG 字符串；缺省用内置模板 */
  render?: (data: FaviconRenderData) => string
  /** 在控制台打印名字、背景色与对比度 */
  debug?: boolean
}

export const unplugin = createUnplugin<FaviconIdentityOptions | undefined>((options) => {
  const {
    text,
    bgColor,
    textColor = 'light',
    render = buildFaviconSvg,
    debug = false,
  } = options ?? {}

  let root = process.cwd()
  let base = '/'
  /** 是否处于生产构建：构建时输出真实文件，dev 时由中间件提供 */
  let isBuild = false
  /** 构建时要写入产物的 SVG：在 HTML 转换阶段按 HTML 里的名字生成，和 dev 使用同一套规则 */
  let builtSvg = ''

  /** 图标只在名字变化时重算：哈希成本可以忽略，也没有必要落盘缓存 */
  let icon: { name: string; svg: string; version: string } | null = null

  /** 同一个失败只告警一次，避免 watch 模式下每次重编译刷屏 */
  let lastWarning = ''
  const warn = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (message === lastWarning) return
    lastWarning = message
    console.warn('[favicon-identity] 生成图标失败，保留原图标:', error)
  }

  /** 把输出目录内的相对路径拼成 URL，兼容 base 为 '/'、'/app/'、'./' 与 http(s) 地址 */
  const withBase = (file: string) => {
    if (!base || base === './') return `./${file}`
    return base.endsWith('/') ? `${base}${file}` : `${base}/${file}`
  }

  /** 命名规则：传入的 text > index.html 的 <title> > package.json 的 name */
  const resolveName = async (html?: string) => {
    if (text) return text.trim()

    const fromHtml = html ? extractTitle(html) : undefined
    if (fromHtml) return fromHtml

    try {
      const file = await fs.readFile(path.resolve(root, 'index.html'), 'utf8')
      const title = extractTitle(file)
      if (title) return title
    } catch {
      // index.html 缺失时回退到 package name
    }

    const pkgFile = path.resolve(root, 'package.json')
    try {
      const pkg = JSON.parse(await fs.readFile(pkgFile, 'utf8')) as { name?: unknown }
      const name = typeof pkg.name === 'string' ? pkg.name.trim() : ''
      if (name) return name
      throw new Error(`${pkgFile} 缺少有效的 name 字段`)
    } catch (error) {
      const detail = error instanceof SyntaxError ? `${pkgFile} 不是合法的 JSON` : String(error)
      throw new Error(`无法确定图标文字：未配置 text、index.html 无 <title>，${detail}`)
    }
  }

  const resolveIcon = async (html?: string) => {
    const name = await resolveName(html)
    if (icon?.name === name) return icon

    const identity = createIdentityColor(name, textColor)
    const background = bgColor ?? formatOklch(identity)
    const svg = render({
      char: firstChar(name),
      background,
      foreground: TEXT_STYLES[textColor].color,
    })
    icon = { name, svg, version: hashString(svg) }

    if (debug) {
      const detail = bgColor
        ? '自定义背景色'
        : `对比度 ${contrastWithText(identity, textColor).toFixed(2)}:1`
      console.log(`  🎨 [favicon-identity] ${name} → ${background}（${detail}）`)
    }
    return icon
  }

  /** webpack：资源随编译输出（dev server 直接从内存文件系统提供），HTML 在 processAssets 阶段改写 */
  const setupCompiler = (compiler: unknown) => {
    const native = compiler as CompilerLike
    root = native.options?.context ?? root
    const thisCompilation = native.hooks?.thisCompilation
    if (!thisCompilation) return

    thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      const processAssets = compilation.hooks?.processAssets
      if (!processAssets) return
      const stage = native.webpack?.Compilation?.PROCESS_ASSETS_STAGE_SUMMARIZE ?? 3000

      processAssets.tapPromise({ name: PLUGIN_NAME, stage }, async (assets) => {
        let current: { svg: string; version: string }
        try {
          current = await resolveIcon()
        } catch (error) {
          warn(error)
          return
        }

        const RawSource = native.webpack?.sources?.RawSource
        if (!RawSource) return
        const publicPath =
          typeof native.options?.output?.publicPath === 'string'
            ? native.options.output.publicPath
            : undefined

        for (const name of Object.keys(assets ?? {})) {
          if (!name.endsWith('.html')) continue

          const source = compilation.getAsset?.(name)?.source.source()
          const html = typeof source === 'string' ? source : source?.toString()
          if (html == null) continue

          const href = `${assetHref(name, publicPath, FAVICON_FILE)}?v=${current.version}`
          const next = injectIconLink(html, href)
          if (next !== html) compilation.updateAsset?.(name, new RawSource(next))
        }
      })
    })
  }

  return {
    name: PLUGIN_NAME,
    async buildStart() {
      // Vite 的 buildStart 由下面的 vite 配置覆盖，这里覆盖 webpack
      try {
        const { svg } = await resolveIcon()
        this.emitFile({ type: 'asset', fileName: FAVICON_FILE, source: svg })
      } catch (error) {
        warn(error)
      }
    },
    webpack: setupCompiler,
    vite: {
      // 构建时 HTML 是在 vite:build-html 的 generateBundle 里才转换的，
      // 插件必须排在它后面，generateBundle 才能拿到最终 HTML 对应的图标再写进产物。
      enforce: 'post',
      configResolved(config) {
        root = config.root
        base = config.base
        isBuild = config.command === 'build'
      },
      buildStart() {
        // watch 模式会重复构建：清掉上一轮的图标，避免把旧内容写进产物
        builtSvg = ''
      },
      async generateBundle() {
        // dev 由 configureServer 的中间件实时返回图标，只有构建才需要写进产物。
        // 用 fileName 而不是 name：图标必须落在产物根目录，且浏览器会按固定路径请求 favicon，
        // 不该被 Vite 丢进 assets/ 并加内容哈希。
        if (!isBuild || !builtSvg) return
        this.emitFile({ type: 'asset', fileName: FAVICON_FILE, source: builtSvg })
      },
      configureServer(server) {
        const iconUrl = withBase(FAVICON_FILE)
        server.middlewares.use((req, res, next) => {
          const pathname = (req.url ?? '').split('?')[0]
          if (pathname !== iconUrl && !pathname.endsWith(`/${FAVICON_FILE}`)) return next()
          resolveIcon()
            .then(({ svg }) => {
              res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
              res.setHeader('Cache-Control', 'no-store')
              res.end(svg)
            })
            .catch(next)
        })
      },
      transformIndexHtml: {
        // 必须用 post：Vite 自己会在 pre 阶段给 HTML 里的绝对路径补 base，
        // 我们再补一次就会变成 /app/app/xxx。放在 post 阶段，href 由我们按 base 拼好且不会被二次处理。
        order: 'post',
        async handler(html) {
          try {
            // 名字一律从传进来的 HTML 解析：dev 与构建走同一条路径，颜色不会出现两套
            const { svg, version } = await resolveIcon(html)
            // 构建时图标稍后由 generateBundle 写到产物根目录；开发时指向 dev server 接口，用哈希破缓存
            if (isBuild) builtSvg = svg
            const href = isBuild ? withBase(FAVICON_FILE) : `${withBase(FAVICON_FILE)}?v=${version}`

            return injectIconLink(html, href)
          } catch (error) {
            console.warn('[favicon-identity] 生成图标失败，保留原图标:', error)
            return html
          }
        },
      },
    },
  }
})

export default unplugin

export const vite = unplugin.vite
export const webpack = unplugin.webpack
