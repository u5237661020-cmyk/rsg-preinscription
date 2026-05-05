import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANT : remplacez 'rsg-preinscription' par le nom EXACT de votre repo GitHub
export default defineConfig({
  plugins: [react()],
  base: '/rsg-preinscription/',
});
