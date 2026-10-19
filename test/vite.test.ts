import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer, build as viteBuild } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FaviconIdentityOptions } from '../src'
import { TEXT_STYLES } from '../src/core'
import faviconIdentity from '../src/vite'

const ICON_LINK_RE = /<link\b[^>]*rel="icon"[^>]*>/gi

/** 收集页面里所有 rel="icon" 的 link */
function iconLinks(html: string): string[] {
  return html.match(ICON_LINK_RE) ?? []
}

/** 取第一个 icon link 的 href；没有就报错，避免断言在 undefined 上静默通过 */
function iconHref(html: string): string {
  const link = iconLinks(html)[0]
  const href = link && /\bhref="([^"]+)"/.exec(link)?.[1]
  if (!href) throw new Error('页面里没有带 href 的 rel="icon" link')
  return href
}

interface Project {
  html: string
  pkg?: { name?: string }
}

const created: Array<{ dir: string; server?: ViteDevServer }> = []

const PROJECTS_ROOT = fileURLToPath(new URL('./.tmp/', import.meta.url))

/** 创建唯一的项目目录，mkdtemp 保证并发测试不会互相覆盖 */
async function createProjectDir() {
  await mkdir(PROJECTS_ROOT, { recursive: true })
  return mkdtemp(path.join(PROJECTS_ROOT, 'project-'))
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const item of created.splice(0)) {
    await item.server?.close()
    await rm(item.dir, { recursive: true, force: true })
  }
})

/** 起一个真实的 Vite dev server，让插件走完整的 HTML 转换与资源请求链路 */
async function startDevServer(
  project: Project,
  options?: FaviconIdentityOptions,
  { root = '' }: { root?: string } = {}
) {
  const dir = await createProjectDir()
  const item: { dir: string; server?: ViteDevServer } = { dir }
  created.push(item)

  // root 可以指向子目录，模拟 monorepo / 多页项目里的 root 配置
  const appDir = path.join(dir, root)
  await mkdir(appDir, { recursive: true })
  await writeFile(path.join(appDir, 'index.html'), project.html)
  if (project.pkg) {
    await writeFile(path.join(appDir, 'package.json'), JSON.stringify(project.pkg))
  }

  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    root: appDir,
    server: { host: '127.0.0.1', port: 0 },
    plugins: [faviconIdentity(options)],
  })
  item.server = server
  await server.listen()

  const base = server.resolvedUrls?.local[0]
  if (!base) throw new Error('Vite dev server 没有暴露访问地址')
  return { server, base }
}

async function get(base: string, href: string) {
  const response = await fetch(new URL(href, base))
  return { response, body: await response.text() }
}

/** 跑一次真实的生产构建，返回产物目录 */
async function buildProject(
  project: Project,
  options?: FaviconIdentityOptions,
  { base = '/', root = '' }: { base?: string; root?: string } = {}
) {
  const dir = await createProjectDir()
  created.push({ dir })

  const appDir = path.join(dir, root)
  await mkdir(appDir, { recursive: true })
  await writeFile(path.join(appDir, 'index.html'), project.html)
  if (project.pkg) {
    await writeFile(path.join(appDir, 'package.json'), JSON.stringify(project.pkg))
  }

  const outDir = path.join(dir, 'dist')
  await viteBuild({
    configFile: false,
    logLevel: 'silent',
    root: appDir,
    base,
    build: { outDir, emptyOutDir: true },
    plugins: [faviconIdentity(options)],
  })
  return { dir, outDir }
}

/** 把 html 里的 href 映射回产物目录中的文件路径 */
function outputFile(outDir: string, href: string) {
  return path.join(outDir, href.replace(/^\//, ''))
}

function page({ title, legacyIcon = true }: { title?: string; legacyIcon?: boolean } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    ${legacyIcon ? '<link rel="icon" type="image/svg+xml" href="/legacy-icon.svg" />' : ''}
    ${title ? `<title>${title}</title>` : ''}
  </head>
</html>`
}

describe('vite 集成', () => {
  it('替换原有 icon 引用，并返回内容正确的 SVG', async () => {
    const { base } = await startDevServer({
      html: page({ title: '门诊随访系统' }),
      pkg: { name: 'unrelated-package' },
    })

    const { response, body: html } = await get(base, '/')
    expect(response.status).toBe(200)

    // 原有的 legacy icon 应被替换，而不是追加成两条
    const links = iconLinks(html)
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('type="image/svg+xml"')
    expect(links[0]).not.toContain('legacy-icon.svg')

    const href = iconHref(html)
    expect(href).toMatch(/^\/__favicon-identity\.svg\?v=[0-9a-f]{8}$/)

    const { response: iconResponse, body: svg } = await get(base, href)
    expect(iconResponse.status).toBe(200)
    expect(iconResponse.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(iconResponse.headers.get('cache-control')).toBe('no-store')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    // <title> 优先于 package name
    expect(svg).toContain('>门</text>')
    expect(svg).toContain(`fill="${TEXT_STYLES.light.color}"`)
    expect(svg).toMatch(/<rect[^>]*fill="oklch\(0\.\d{3} \d\.\d{3} \d+\)"/)
    expect(svg).toContain('rx="14"')
  })

  it('没有 <title> 时用 package.json 的 name，并在缺少 icon 时插入 head', async () => {
    const { base } = await startDevServer({
      html: page({ legacyIcon: false }),
      pkg: { name: 'inventory-console' },
    })

    const { body: html } = await get(base, '/')
    const link = iconLinks(html)[0]
    expect(link).toBeTruthy()
    expect(html.indexOf(link as string)).toBeLessThan(html.indexOf('</head>'))

    const { body: svg } = await get(base, iconHref(html))
    expect(svg).toContain('>i</text>')
  })

  it('root 指向子目录时，名字仍从该目录的 index.html / package.json 解析', async () => {
    const { base } = await startDevServer(
      { html: page({ legacyIcon: false }), pkg: { name: 'nested-app' } },
      undefined,
      { root: 'apps/web' }
    )

    const { body: html } = await get(base, '/')
    const { body: svg } = await get(base, iconHref(html))
    // 不能用当前工作目录的 package.json 顶替
    expect(svg).toContain('>n</text>')
  })

  it('text / bgColor / textColor 优先于页面与 package.json', async () => {
    const { base } = await startDevServer(
      { html: page({ title: '页面标题' }), pkg: { name: 'pkg-name' } },
      { text: '复发性流产专科病历', bgColor: '#123456', textColor: 'dark' }
    )

    const { body: html } = await get(base, '/')
    const { body: svg } = await get(base, iconHref(html))
    expect(svg).toContain('>复</text>')
    expect(svg).toContain('fill="#123456"')
    expect(svg).toContain(`fill="${TEXT_STYLES.dark.color}"`)
  })

  it('自定义 render 的结果就是资源接口返回的内容', async () => {
    const { base } = await startDevServer(
      { html: page({ title: '自定义模板' }) },
      {
        render: ({ char, background, foreground }) =>
          `<svg data-custom="1"><text>${char}|${background}|${foreground}</text></svg>`,
      }
    )

    const { body: html } = await get(base, '/')
    const { body: svg } = await get(base, iconHref(html))
    expect(svg.startsWith('<svg data-custom="1">')).toBe(true)
    expect(svg).toContain(`>自|oklch(`)
    expect(svg).toContain(`|${TEXT_STYLES.light.color}</text>`)
  })

  it('既没有 <title> 也没有 package 的 name 时保留原引用并告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { base } = await startDevServer({ html: page() })

    const { body: html } = await get(base, '/')
    const links = iconLinks(html)
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('legacy-icon.svg')

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[1])).toContain('无法确定图标文字')
  })
})

describe('vite 构建', () => {
  it('产出 SVG 文件，并让 link 指向它', async () => {
    const { outDir } = await buildProject({
      html: page({ title: '门诊随访系统' }),
      pkg: { name: 'unrelated-package' },
    })

    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const links = iconLinks(html)
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('type="image/svg+xml"')
    expect(links[0]).not.toContain('legacy-icon.svg')

    // 图标是固定路径资源：落在产物根目录，不进 assets/，也不加内容哈希
    const href = iconHref(html)
    expect(href).toBe('/__favicon-identity.svg')

    const svg = await readFile(path.join(outDir, '__favicon-identity.svg'), 'utf8')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('>门</text>')
    expect(svg).toContain(`fill="${TEXT_STYLES.light.color}"`)
    await expect(readFile(path.join(outDir, 'assets', '__favicon-identity.svg'))).rejects.toThrow()
  })

  it('base 带路径时 link 指向带前缀的资源地址', async () => {
    const { outDir } = await buildProject({ html: page({ title: '门诊随访系统' }) }, undefined, {
      base: '/app/',
    })

    const html = await readFile(path.join(outDir, 'index.html'), 'utf8')
    const href = iconHref(html)
    expect(href).toBe('/app/__favicon-identity.svg')

    const svg = await readFile(outputFile(outDir, href.replace(/^\/app\//, '')), 'utf8')
    expect(svg).toContain('>门</text>')
  })
})
