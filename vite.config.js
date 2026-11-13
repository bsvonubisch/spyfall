import { defineConfig } from 'vite';
export default defineConfig({
  build: { rollupOptions: { output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'], qr: ['qrcode'] } } } },
  server: { watch: { ignored: ['**/*-debug.log', '**/.firebase/**'] } },
});
