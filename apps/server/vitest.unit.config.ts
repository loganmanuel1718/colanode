import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@colanode/server': path.resolve(rootDir, 'src'),
      '@colanode/core': path.resolve(rootDir, '../../packages/core/src'),
      '@colanode/crdt': path.resolve(rootDir, '../../packages/crdt/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/lib/**/*.test.ts'],
  },
});
