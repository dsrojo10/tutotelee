import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets work both at / and at /tutotelee/ on GitHub Pages.
  base: './',
  build: {
    rollupOptions: {
      input: {
        phone: 'index.html',
        tv: 'tv.html',
      },
    },
  },
});
