import { defineConfig } from 'vite'

export default defineConfig({
  root: 'client',
  server: {
    port: process.env.VITE_FRONTEND_PORT || 3000,
    proxy: {
      '/api': process.env.VITE_BACKEND_URL || 'http://localhost:3001'
    }
  },
  build: {
    outDir: '../dist'
  }
})