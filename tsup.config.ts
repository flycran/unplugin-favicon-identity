import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vite: 'src/vite.ts',
    webpack: 'src/webpack.ts',
  },
  format: ['esm', 'cjs'],
  target: 'node18',
  dts: true,
  sourcemap: true,
  clean: true,
})
