import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

export default defineConfig({
  root: 'renderer',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'renderer', 'index.html')
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(fileURLToPath(import.meta.url), '..')
    }
  }
})
