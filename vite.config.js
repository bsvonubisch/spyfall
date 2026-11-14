import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (env.VITE_USE_EMULATORS !== 'true') {
    let config;
    try {
      config = JSON.parse(env.VITE_FIREBASE_CONFIG || '');
    } catch {
      throw new Error(
        'Set VITE_FIREBASE_CONFIG to valid JSON in .env.local or the build environment.',
      );
    }
    for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) {
      if (typeof config?.[key] !== 'string' || !config[key])
        throw new Error(`Firebase configuration is missing ${key}.`);
    }
  }
  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            qr: ['qrcode'],
          },
        },
      },
    },
    server: { watch: { ignored: ['**/*-debug.log', '**/.firebase/**'] } },
  };
});
