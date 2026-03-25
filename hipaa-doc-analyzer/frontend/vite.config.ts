import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL;
  const useProxy = env.VITE_DEV_API_PROXY === 'true' && apiBase;

  let proxy: Record<string, { target: string; changeOrigin: boolean; rewrite: (p: string) => string }> =
    {};
  if (useProxy) {
    try {
      const u = new URL(apiBase);
      const origin = u.origin;
      const basePath = (u.pathname || '').replace(/\/$/, '');
      proxy['/dev-api'] = {
        target: origin,
        changeOrigin: true,
        rewrite: (p) => basePath + p.replace(/^\/dev-api/, '')
      };
    } catch {
      // Invalid VITE_API_BASE_URL — skip proxy; getApiBaseUrl() will still throw at runtime if needed
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },
    server: {
      port: 5173,
      /** If 5173 is taken (leftover Vite), use the next free port instead of exiting. */
      strictPort: false,
      // Listen on all interfaces so http://127.0.0.1:5173 and http://localhost:5173 both work reliably.
      host: true,
      proxy
    }
  };
});
