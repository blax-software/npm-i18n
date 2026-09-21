import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      node: 'src/node.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    clean: true,
    treeshake: true,
    external: ['esbuild'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    splitting: false,
    clean: false,
    treeshake: true,
    external: ['esbuild'],
    banner: { js: '#!/usr/bin/env node' },
  },
])
