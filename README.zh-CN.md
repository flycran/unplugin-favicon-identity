# unplugin-favicon-identity

[English](./README.md) | 简体中文

[![npm 版本](https://img.shields.io/npm/v/unplugin-favicon-identity?label=npm)](https://www.npmjs.com/package/unplugin-favicon-identity)
[![npm 下载量](https://img.shields.io/npm/dm/unplugin-favicon-identity)](https://www.npmjs.com/package/unplugin-favicon-identity)
[![单元测试](https://img.shields.io/github/actions/workflow/status/flycran/unplugin-favicon-identity/ci.yml?label=tests)](https://github.com/flycran/unplugin-favicon-identity/actions/workflows/ci.yml)
[![许可证](https://img.shields.io/github/license/flycran/unplugin-favicon-identity)](https://github.com/flycran/unplugin-favicon-identity/blob/main/LICENSE)

**[打开在线预览站 →](https://flycran.github.io/unplugin-favicon-identity/)**

给每个项目一枚属于自己的开发环境 favicon —— 一块圆角色块，写着项目名的首字 —— 这样不看标题也能
分清浏览器标签页。

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import faviconIdentity from 'unplugin-favicon-identity/vite'

export default defineConfig({
  plugins: [faviconIdentity()],
})
```

配置就这些。名字取自 `index.html` 的 `<title>`，不需要额外填什么：

| 项目 | title | 图标 |
| --- | --- | --- |
| A | `复发性流产专科病历` | 复 |
| B | `门诊随访系统` | 门 |
| C | `PACS 影像工作站` | P |

每个项目一个颜色，而且同一个项目**永远是同一个颜色** —— 不会每次重启都换一副面孔。

dev 与生产构建都支持。dev 下图标由 dev server 直接从内存返回；生产构建时会把 SVG 输出到产物
根目录的 `__favicon-identity.svg`，并把 `<link rel="icon">` 改写成指向它。如果不想让图标出现
在构建产物里，只在开发时加载插件即可：

```ts
// vite.config.ts
export default defineConfig(({ command }) => ({
  plugins: [command === 'serve' && faviconIdentity()],
}))
```

## 安装

```bash
npm i -D unplugin-favicon-identity
```

支持 Vite 5 / 6 / 7 / 8 与 webpack 5。

### webpack

```ts
// webpack.config.ts
import HtmlWebpackPlugin from 'html-webpack-plugin'
import faviconIdentity from 'unplugin-favicon-identity/webpack'

export default {
  plugins: [new HtmlWebpackPlugin({ template: 'index.html' }), faviconIdentity()],
}
```

插件会把 SVG 作为 asset 输出，并在 `PROCESS_ASSETS_STAGE_SUMMARIZE` 阶段改写所有 `.html`
asset，所以由其他插件生成的 HTML 也能覆盖到。`output.publicPath` 是字符串时按它拼 URL，否则
使用相对于页面的路径。

dev server 不需要额外配置：`webpack-dev-server` 会直接从内存文件系统提供这个 SVG，`<link>`
指向的地址即可访问。不支持 webpack 4。

## 选项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `text` | `string` | `<title>` → 目录名 | 取首字的那段文字 |
| `bgColor` | `string` | 由名字派生 | 任意 CSS 颜色，如 `oklch(0.5 0.1 200)` |
| `textColor` | `'light' \| 'dark'` | `'light'` | 文字色预设，同时决定背景的亮度区间 |
| `render` | `(data) => string` | 内置模板 | 返回完整的 SVG 字符串 |
| `debug` | `boolean` | `false` | 在终端打印名字与颜色 |

### 自定义模板

```ts
faviconIdentity({
  render: ({ char, background, foreground }) => `<svg xmlns="http://www.w3.org/2000/svg"
    width="64" height="64" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="32" fill="${background}"/>
    <text x="32" y="32" fill="${foreground}" font-size="44" text-anchor="middle"
      dominant-baseline="central">${char}</text>
  </svg>`,
})
```

你会拿到 `char`、`background`、`foreground`，画成什么形状由你决定，但下面的颜色契约依然成立。
如果模板里要拼 `char`，记得转义 —— 内置模板用的是导出的 `escapeXml`。

## 颜色是怎么来的

`sha256(名字)` 给出两个互相独立的小数：第 0 个 32 位字定色相，第 4 个 32 位字在固定区间里插值出
亮度。彩度则被推到该亮度、该色相下 **sRGB 色域的边界**。其余的字是预留位，以后加参数不会挪动
这两个已经决定颜色的值。Node 端由库负责对名字做 SHA-256；`/web` 入口则直接接收摘要，所以任意
运行时都适用同一套规则。

由此得到三条性质，都有测试兜底：

1. **确定**：同一个项目名永远是同一个颜色。哈希只要微秒级，所以没有缓存，也就没有缓存过期的问题。
2. **永不被色域裁切**。这一条比听起来重要：颜色超出 sRGB 时，浏览器**不会**保持亮度 —— 它会把
   linear 分量直接钳到 `[0, 1]`，亮度随之悄悄漂移（实测请求 `L=0.53`，渲染出来是 `0.68`）。一旦
   发生这种事，亮度区间就不再控制得了对比度。把彩度压在边界内就绕开了整个问题。
3. **可读**。OKLab 的亮度是感知亮度，加上每个文字色预设对应一组写死的区间，对比度在**生成时**就
   确定了，不需要事后校验。穷举 360 个色相后的最差情况：`light` 预设 **5.20:1**、`dark` 预设
   **4.76:1**（WCAG AA 要求 4.5:1）。

彩度**不是**一个小常数，而这正是生成配色看起来发灰的常见原因。每个色相都取到自己的上限 —— 青色
大约只能到 `C=0.09`，品红能到 `0.29` —— 所以每个颜色都是该亮度下 sRGB 允许的最鲜艳版本。

打开 `faviconIdentity({ debug: true })` 就能看到你的项目拿到了什么：

```
  🎨 [favicon-identity] 门诊随访系统 → oklch(0.511 0.254 311)
```

## 程序化 API

### Node

```ts
import { createFavicon, createIdentityColor } from 'unplugin-favicon-identity'

const { svg, background } = createFavicon('门诊随访系统')
const color = createIdentityColor('门诊随访系统', 'light') // { lightness, chroma, hue }
```

### 任意运行时（包括浏览器）

`unplugin-favicon-identity/web` 不含任何 Node API，且保持同步。调用方只需要提供 SHA-256 摘要，
浏览器里直接用 Web Crypto：

```ts
import { createFaviconFromHash } from 'unplugin-favicon-identity/web'

const name = '门诊随访系统'
const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name))
const { svg, background, version } = createFaviconFromHash({ text: name, hash })
```

`hash` 可以是 `ArrayBuffer` 或 `Uint8Array`。两个入口共用同一套颜色与 SVG 代码，同一个名字在任一端
生成的图标完全一致。

另外还导出：`formatOklch`、`buildFaviconSvg`、`escapeXml`，以及 `OklchColor`、`TextColor`、
`FaviconRenderData`、`Favicon`、`FaviconOptions` 类型（`FaviconFromHashOptions` 仅 web 入口）。
`core` 里其余的东西——色域计算、HTML 解析、对比度校验——都是内部实现，可能随版本调整，
不承诺兼容。对比度由测试套件校验，不作为 API 暴露。

## 注意事项

- dev 下图标由 `/{base}__favicon-identity.svg` 提供，带 `Cache-Control: no-store`；`<link>` 上
  还挂了由名字派生的指纹（`?v=…`），避免浏览器缓存的旧图标赖着不走。webpack 下同一地址由 dev
  server 从内存文件系统直接提供。两种构建器的生产产物都会在根目录写出 `__favicon-identity.svg`。
- 已有的 `<link rel="icon">` 会被替换掉，多余的会被删除；一个都没有就在 `</head>` 前插一个。
- 首个字符按字素簇切分，emoji 的组合序列（`👨‍👩‍👧`、`👍🏽`）不会被拆散。

## 开发

```bash
bun install
bun test        # 颜色契约、名字解析、SVG 转义
bun run build   # tsup → dist（esm + cjs + dts）
bun run playground        # 本地 React 预览站
bun run build:playground  # 静态站点 → playground/dist
```

## 许可证

MIT

