# unplugin-favicon-identity

English | [Chinese (Simplified)](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/unplugin-favicon-identity?label=npm)](https://www.npmjs.com/package/unplugin-favicon-identity)
[![npm downloads](https://img.shields.io/npm/dm/unplugin-favicon-identity)](https://www.npmjs.com/package/unplugin-favicon-identity)
[![tests](https://img.shields.io/github/actions/workflow/status/flycran/unplugin-favicon-identity/ci.yml?label=tests)](https://github.com/flycran/unplugin-favicon-identity/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/flycran/unplugin-favicon-identity)](https://github.com/flycran/unplugin-favicon-identity/blob/main/LICENSE)

Give every project its own dev-server favicon — a rounded tile with the first character of the
project name — so you can tell browser tabs apart without reading titles.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import faviconIdentity from 'unplugin-favicon-identity/vite'

export default defineConfig({
  plugins: [faviconIdentity()],
})
```

That's the whole setup. The name comes from `<title>` in your `index.html`, so nothing else to
configure:

| project | title | icon |
| --- | --- | --- |
| A | `Inpatient Records` | I |
| B | `Outpatient Portal` | O |
| C | `PACS Workstation` | P |

Each one gets a different colour, and the same project always gets the **same** colour — no random
rainbow on every restart.

Both dev and production are covered. In dev the icon is served from memory by the dev server;
for a production build the SVG is emitted as `__favicon-identity.svg` in the output root and the
`<link rel="icon">` is rewritten to point at it. If you'd rather keep the favicon out of the build
output, load the plugin during development only:

```ts
// vite.config.ts
export default defineConfig(({ command }) => ({
  plugins: [command === 'serve' && faviconIdentity()],
}))
```

## Install

```bash
npm i -D unplugin-favicon-identity
```

Vite 5 / 6 / 7 / 8 and webpack 5 are supported.

### webpack

```ts
// webpack.config.ts
import HtmlWebpackPlugin from 'html-webpack-plugin'
import faviconIdentity from 'unplugin-favicon-identity/webpack'

export default {
  plugins: [new HtmlWebpackPlugin({ template: 'index.html' }), faviconIdentity()],
}
```

The plugin emits the SVG as an asset and rewrites every `.html` asset in the
`PROCESS_ASSETS_STAGE_SUMMARIZE` stage, so it also covers HTML produced by other plugins. The
`<link>` uses `output.publicPath` when it is a string; otherwise it is relative to the page.

No dev-server setup is needed: `webpack-dev-server` serves the emitted SVG from its in-memory
filesystem, and the `<link>` points straight at it. Webpack 4 is not supported.

## Options

| option | type | default | description |
| --- | --- | --- | --- |
| `text` | `string` | `<title>` → directory name | Text to take the first character from |
| `bgColor` | `string` | derived from the name | Any CSS colour, e.g. `oklch(0.5 0.1 200)` |
| `textColor` | `'light' \| 'dark'` | `'light'` | Text colour preset; controls the background lightness range |
| `render` | `(data) => string` | built-in template | Return a full SVG string |
| `debug` | `boolean` | `false` | Log the resolved name, colour and contrast ratio |

### Custom template

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

You get `char`, `background` and `foreground`; the colour contract below still holds, only the
drawing is yours. Remember to escape `char` if your template interpolates it into XML — the
built-in template uses the exported `escapeXml` for that.

## How the colour is derived

`sha256(name)` gives two independent numbers: one picks the hue, the other interpolates the
lightness inside a fixed range. The chroma is then pushed to the **sRGB gamut boundary** for that
lightness and hue.

Three properties fall out of that, and they're all covered by tests:

1. **Deterministic.** Same project name → same colour, forever. Hashing costs microseconds, so
   there is no cache to go stale.
2. **Never gamut-clipped.** Colours stay strictly inside sRGB. This matters more than it sounds:
   when a colour is outside the gamut, browsers do *not* preserve its lightness — they clamp the
   linear sRGB channels, which silently shifts lightness (measured: a requested `L=0.53` renders as
   `0.68`). Once that happens, the lightness range stops controlling contrast. Keeping chroma inside
   the boundary avoids the whole problem.
3. **Readable.** Because OKLab lightness is perceptual and the range is fixed per text preset,
   contrast is decided at generation time rather than checked afterwards. Worst case over all 360
   hues: **5.20:1** with the `light` preset and **4.76:1** with `dark` (WCAG AA needs 4.5:1).

Chroma is *not* a fixed small number, which is what usually makes generated palettes look washed
out. Each hue goes to its own limit — cyan tops out around `C=0.09` while magenta reaches `0.29` —
so every colour is as saturated as sRGB allows at that lightness.

Run `faviconIdentity({ debug: true })` to print the resolved name, the generated colour and its
contrast ratio to the terminal.

## Core API

The colour maths is exported if you want it elsewhere — it's plain functions with no bundler
dependency:

```ts
import { createIdentityColor, formatOklch, contrastWithText } from 'unplugin-favicon-identity'

const color = createIdentityColor('Outpatient Portal', 'light') // { lightness, chroma, hue }
formatOklch(color) // 'oklch(0.483 0.190 13)'
contrastWithText(color, 'light') // 7.19
```

Also exported: `maxChroma`, `isInSrgbGamut`, `oklchToSrgb`, `relativeLuminance`, `contrastRatio`,
`escapeXml`, `extractTitle`, `firstChar`, `buildFaviconSvg` and the `TEXT_STYLES` presets.

## Notes

- In dev the icon is served from `/{base}__favicon-identity.svg` with `Cache-Control: no-store`, and
  the `<link>` carries a content hash (`?v=…`) so a stale favicon can't survive a reload. Under
  webpack the same URL is served by the dev server from its in-memory filesystem. A production
  build writes `__favicon-identity.svg` to the output root in both cases.
- An existing `<link rel="icon">` is replaced, extras are dropped. If there is none, one is added
  before `</head>`.
- `firstChar` splits by grapheme cluster, so emoji sequences (`👨‍👩‍👧`, `👍🏽`) aren't torn apart.

## Development

```bash
bun install
bun test        # colour contract, name parsing, SVG escaping
bun run build   # tsup → dist (esm + cjs + dts)
bun run playground
```

## License

MIT

