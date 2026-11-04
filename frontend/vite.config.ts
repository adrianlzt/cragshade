import { svelte } from '@sveltejs/vite-plugin-svelte'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vitest/config'

const backend = `http://127.0.0.1:${process.env.BACKEND_PORT ?? 8370}`

export default defineConfig({
  // HTTPS: los sensores (brújula) y la geolocalización solo funcionan en contexto seguro.
  plugins: [svelte(), basicSsl()],
  server: {
    host: true,
    proxy: { '/api': backend, '/media': backend },
  },
  test: { environment: 'node' },
})
