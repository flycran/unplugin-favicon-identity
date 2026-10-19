import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import { afterEach, describe, expect, it } from 'vitest'
import type { Configuration, Stats } from 'webpack'
import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'
import type { FaviconIdentityOptions } from '../src'
import { TEXT_STYLES } from '../src/core'
import faviconIdentity from '../src/webpack'

const ICON_LINK_RE = /<link\b[^>]*rel="icon"[^>]*>/gi

function iconLinks(html: string): string[] {
  return html.match(ICON_LINK_RE) ?? []
}

function iconHref(html: string): string {
  const link = iconLinks(html)[0]
  const href = link && /\bhref="([^"]+)"/.exec(link)?.[1]
  if (!href) throw new Error('页面里没有带 href 的 rel="icon" link')
  return href
}

const created: string[] = []
const servers: WebpackDevServer[] = []

const PROJECTS_ROOT = fileURLToPath(new URL('./.tmp/', import.meta.url))

async function createProjectDir() {
  await mkdir(PROJECTS_ROOT, { recursive: true })
  return mkdtemp(path.join(PROJECTS_ROOT, 'webpack-'))
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop()
  for (const dir of created.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

function page({ title, legacyIcon = true }: { title?: string; legacyIcon?: boolean } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    ${legacyIcon ? '<link rel="icon" type="image/svg+xml" href="/legacy-icon.svg" />' : ''}
    ${title ? `<title>${title}</title>` : ''}
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`
}

interface Project {
  html: string
  pkg?: { name?: string }
}

/** WDS 的 http.Server 不对外暴露，只取测试需要的 address() */
interface ServerLike {
  server?: { address: () => { port: number } | string | null }
}

/** 起一个真实的 webpack-dev-server，验证 dev 下资源走内存文件系统 */
async function startDevServer(project: Project, options?: FaviconIdentityOptions) {
  const dir = await createProjectDir()
  created.push(dir)

  await writeFile(path.join(dir, 'index.html'), project.html)
  await writeFile(path.join(dir, 'index.js'), 'console.log("ok")\n')
  if (project.pkg) {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(project.pkg))
  }

  const compiler = webpack({
    mode: 'development',
    context: dir,
    entry: path.join(dir, 'index.js'),
    output: { path: path.join(dir, 'dist') },
    plugins: [
      new HtmlWebpackPlugin({ template: path.join(dir, 'index.html') }),
      faviconIdentity(options),
    ],
  })

  const server = new WebpackDevServer(
    { host: '127.0.0.1', port: 0, static: false, hot: false, client: false },
    compiler
  )
  servers.push(server)
  await server.start()

  const address = (server as unknown as ServerLike).server?.address()
  if (!address || typeof address === 'string') throw new Error('dev server 没有暴露端口')
  return `http://127.0.0.1:${address.port}`
}

/** 首次请求可能撞上编译未完成，失败时重试几次 */
async function get(base: string, href: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(new URL(href, base))
      if (response.ok) return { response, body: await response.text() }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw lastError
}

/** 跑一次真实的 webpack 构建，返回产物目录与 stats */
async function buildProject(
  project: Project,
  options?: FaviconIdentityOptions,
  { publicPath }: { publicPath?: string } = {}
) {
  const dir = await createProjectDir()
  created.push(dir)

  await writeFile(path.join(dir, 'index.html'), project.html)
  await writeFile(path.join(dir, 'index.js'), 'console.log("ok")\n')
  if (project.pkg) {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(project.pkg))
  }

  const outDir = path.join(dir, 'dist')
  const config: Configuration = {
    mode: 'production',
    context: dir,
    entry: path.join(dir, 'index.js'),
    devtool: false,
    output: { path: outDir, clean: true, publicPath },
    plugins: [
      new HtmlWebpackPlugin({ template: path.join(dir, 'index.html') }),
      faviconIdentity(options),
    ],
  }

  const stats = await new Promise<Stats>((resolve, reject) => {
    webpack(config, (error, result) => {
      if (error) reject(error)
      else if (!result) reject(new Error('webpack 没有返回 stats'))
      else resolve(result)
    })
  })

  if (stats.hasErrors()) {
    throw new Error(stats.toString({ errors: true, warnings: true, colors: false }))
  }

  return { dir, outDir }
}

describe('webpack 集成', () => {
  it('替换原有 icon 引用，并把 SVG 写到产物根目录', async () => {
    const { outDir } = await buildProject({
      html: page({ title: '门诊随访系统' }),
      pkg: { name: 'unrelated-package' },
    })

    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const links = iconLinks(html)
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('type="image/svg+xml"')
    expect(links[0]).not.toContain('legacy-icon.svg')

    const href = iconHref(html)
    expect(href).toMatch(/^\.\/__favicon-identity\.svg\?v=[0-9a-f]{8}$/)

    const svg = await readFile(path.join(outDir, '__favicon-identity.svg'), 'utf8')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    // <title> 优先于 package name
    expect(svg).toContain('>门</text>')
    expect(svg).toContain(`fill="${TEXT_STYLES.light.color}"`)
  })

  it('没有 icon 引用时插入 head，publicPath 为绝对路径时直接用', async () => {
    const { outDir } = await buildProject(
      { html: page({ title: '库存控制台', legacyIcon: false }) },
      undefined,
      { publicPath: '/app/' }
    )

    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const link = iconLinks(html)[0]
    expect(link).toBeTruthy()
    expect(html.indexOf(link as string)).toBeLessThan(html.indexOf('</head>'))
    expect(iconHref(html)).toMatch(/^\/app\/__favicon-identity\.svg\?v=[0-9a-f]{8}$/)
  })

  it('没有 <title> 时回退到 package.json 的 name', async () => {
    const { outDir } = await buildProject({
      html: page({ legacyIcon: false }),
      pkg: { name: 'inventory-console' },
    })

    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const href = iconHref(html)
    const svg = await readFile(path.join(outDir, href.split('?')[0].replace(/^\.\//, '')), 'utf8')
    expect(svg).toContain('>i</text>')
  })

  it('选项优先于页面标题与 package.json', async () => {
    const { outDir } = await buildProject(
      { html: page({ title: '页面标题' }), pkg: { name: 'pkg-name' } },
      { text: '复发性流产专科病历', bgColor: '#123456', textColor: 'dark' }
    )

    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const svg = await readFile(path.join(outDir, '__favicon-identity.svg'), 'utf8')
    expect(svg).toContain('>复</text>')
    expect(svg).toContain('fill="#123456"')
    expect(svg).toContain(`fill="${TEXT_STYLES.dark.color}"`)
    expect(iconLinks(html)).toHaveLength(1)
  })

  it('dev server 直接提供内存中的图标', async () => {
    const base = await startDevServer({ html: page({ title: '门诊随访系统' }) })

    const { body: html } = await get(base, '/')
    const href = iconHref(html)
    expect(href).toMatch(/^\.\/__favicon-identity\.svg\?v=[0-9a-f]{8}$/)

    const { response, body: svg } = await get(base, href)
    expect(response.headers.get('content-type')).toContain('image/svg+xml')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('>门</text>')
  })
})
