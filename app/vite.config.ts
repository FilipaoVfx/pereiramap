import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };
const buildCommit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';

// Vercel sirve desde el dominio raíz. GitHub Pages sigue usando una base
// relativa para conservar el deploy legado bajo /pereiramap/.
export default defineConfig({
  plugins: [react()],
  base: process.env.VERCEL === '1' ? '/' : './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  build: { target: 'es2022', sourcemap: false },
});
