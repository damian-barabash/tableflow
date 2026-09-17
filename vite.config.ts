import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'

// Absolute base: the site lives at the root of tableflow.pl and uses clean URLs (/regulamin, /karta).
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    {
      name: 'spa-404',
      closeBundle() {
        try { copyFileSync('dist/index.html', 'dist/404.html') } catch { /* dev */ }
      },
    },
  ],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          motion: ['motion'],
        },
      },
    },
  },
})
