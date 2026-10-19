export type { OklchColor, Rgb, TextColor } from './color'
export {
  contrastRatio,
  contrastWithText,
  createIdentityColor,
  formatOklch,
  hashRatio,
  hashString,
  isInSrgbGamut,
  maxChroma,
  oklabToLinearRgb,
  oklchToSrgb,
  relativeLuminance,
  TEXT_STYLES,
} from './color'
export { decodeHtmlEntities, extractTitle, firstChar } from './name'
export type { FaviconRenderData } from './svg'
export { buildFaviconSvg, CORNER_RADIUS, escapeXml, FONT_SIZE, ICON_SIZE } from './svg'
