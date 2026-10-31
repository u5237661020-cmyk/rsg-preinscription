import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Application servie à la racine de https://preinscription.reveilsaintgereon.fr (o2switch).
// L'API PHP est dans le dossier api/ (copié dans dist/api au déploiement).
// En développement, lancez l'API avec : php -S 127.0.0.1:8080 -t .
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
});
