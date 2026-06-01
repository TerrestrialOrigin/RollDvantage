import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

const isElectron = process.env.BUILD_TARGET === 'electron';

// https://vite.dev/config/
export default defineConfig({
  base: isElectron ? './' : '/', // Use a relative base for Electron, absolute for Capacitor
  build: {
    outDir: isElectron ? 'dist-electron' : 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'dist'],
  }
})