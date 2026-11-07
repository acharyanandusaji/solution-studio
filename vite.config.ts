import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base keeps the app working from any GitHub Pages repository path.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
  },
})
