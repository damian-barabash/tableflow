import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'

// Relative base → works on user.github.io/<repo>/ and on a custom domain alike.
export default defineConfig({
  base: './',
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
