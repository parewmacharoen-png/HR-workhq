import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function resolveBuildSha(): string {
  if (process.env.VITE_BUILD_SHA) return process.env.VITE_BUILD_SHA;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return `dev@${new Date().toISOString()}`;
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(resolveBuildSha()),
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
