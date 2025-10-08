import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  // Não precisamos mais das seções 'define' ou 'resolve' para este problema.
  // O Vite já cuida das variáveis de ambiente com o prefixo VITE_.
});
