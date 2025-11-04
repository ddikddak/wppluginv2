import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Use relative base so built index.html references ./assets, which works under plugin subpaths
  base: './',
  plugins: [react()],
  // Dev-time proxy so calls to /wp-json/* from the Vite dev server (http://localhost:5173)
  // are forwarded to the preview server (http://localhost:5500). This ensures the wizard
  // can hit the image generation endpoint during local development.
  server: {
    proxy: {
      '/wp-json': {
        target: 'http://localhost:5500',
        changeOrigin: true,
      }
    }
  }
})
