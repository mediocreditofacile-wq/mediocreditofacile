import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // I test di isolamento parlano con un branch Neon vero: in parallelo si
    // pesterebbero i piedi sugli stessi dati di prova.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
