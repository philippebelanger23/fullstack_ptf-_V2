import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: Object.fromEntries(
        [
          '/fetch-sectors', '/fetch-performance', '/fetch-betas', '/fetch-dividends',
          '/index-exposure', '/index-history',
          '/currency-performance', '/generate-pdf',
          '/save-portfolio-config', '/load-portfolio-config',
          '/save-sector-weights', '/load-sector-weights',
          '/save-asset-geo', '/load-asset-geo',
          '/check-nav-lag', '/upload-nav', '/nav-audit', '/save-manual-nav',
          '/portfolio-workspace', '/sector-history',
        ].map(route => [route, { target: 'http://localhost:8000', changeOrigin: true, secure: false }])
      ),
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
