import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Mirrors the `@/*` path alias from tsconfig.json so the engine's own imports
// resolve when the pure utils are tested outside the Next.js build.
export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
