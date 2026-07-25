import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const pretendardRoot = realpathSync(resolve(projectRoot, 'node_modules/pretendard'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ['math.luvid.app', 'flow-math.com', 'www.flow-math.com'],
    fs: {
      allow: [projectRoot, pretendardRoot],
    },
  },
  preview: {
    allowedHosts: ['math.luvid.app', 'flow-math.com', 'www.flow-math.com'],
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
