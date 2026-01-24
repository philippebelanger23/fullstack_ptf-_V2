import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/analyze': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/index-exposure': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/fetch-sectors': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/fetch-performance': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/index-history': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/fetch-betas': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/currency-performance': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/generate-pdf': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/fetch-dividends': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/save-portfolio-config': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/load-portfolio-config': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/analyze-manual': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/save-sector-weights': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/load-sector-weights': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/check-nav-lag': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/upload-nav': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/save-asset-geo': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/load-asset-geo': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
      },
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
