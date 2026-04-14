import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import fs from 'fs';
import dotenv from 'dotenv';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Explicitly load .env.local to override process.env.GEMINI_API_KEY which might be polluted
  let localApiKey = env.GEMINI_API_KEY;
  if (fs.existsSync('.env.local')) {
    const localEnv = dotenv.parse(fs.readFileSync('.env.local'));
    if (localEnv.GEMINI_API_KEY) {
      localApiKey = localEnv.GEMINI_API_KEY;
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(localApiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
server: {
      port: 13000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Allow LAN + Tailscale access. Vite 5.2+ blocks non-localhost Host
      // headers by default as DNS-rebinding protection; since this is a
      // personal tool served only on the home LAN + private tailnet, we
      // accept any host so that MagicDNS names (e.g. *.ts.net) work.
      allowedHosts: true,
    },
  };
});
