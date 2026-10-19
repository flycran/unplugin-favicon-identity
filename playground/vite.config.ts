import { defineConfig } from 'vite'
import faviconIdentity from '../src/vite'

export default defineConfig({
  plugins: [
    faviconIdentity({
      debug: true,
    }),
  ],
})
