import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite resolves the `@/*` aliases from tsconfig.json natively.
  resolve: { tsconfigPaths: true },
  test: {
    // The domain core is pure, so it needs no DOM. Component tests added in a
    // later stage will opt into jsdom per-file via an environment comment.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/core/**', 'src/config/**'],
      exclude: ['src/core/testing/**', '**/*.test.ts'],
    },
  },
});
