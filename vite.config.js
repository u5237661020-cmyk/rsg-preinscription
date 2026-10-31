import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Domaine personnalisé : https://preinscription.reveilsaintgereon.fr (servi à la racine)
export default defineConfig({
  plugins: [react()],
  base: '/',
});
