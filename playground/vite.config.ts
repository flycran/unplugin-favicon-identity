import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import faviconIdentity from '../src/vite'

export default defineConfig({
  // GitHub Pages 部署在 /<repo>/ 下；本地与 CI 默认用根路径
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), faviconIdentity({ debug: true })],
})
