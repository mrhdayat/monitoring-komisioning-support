import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['shared/**/*.test.ts', 'src/**/*.test.ts'],
          setupFiles: ['fake-indexeddb/auto'],
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: { TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, 'migrations')) },
            },
          })),
        ],
        test: {
          name: 'worker',
          include: ['worker/**/*.test.ts'],
          setupFiles: ['./worker/test-setup.ts'],
        },
      },
    ],
  },
});
