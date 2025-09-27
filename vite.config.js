import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'


const vite_pwa_config = {
  srcDir: 'src',
  strategies: 'injectManifest',

  injectRegister: 'networkfirst',
  injectManifest: {
    globPatterns: ['**/*.*']
  },
  devOptions: {
    enabled: true,
    type: 'module'
  },
  manifest: {
    name: 'Aural Music',
    short_name: 'Aural',
    description: 'This is not the greatest music app in the world. This is just a tribute.',
    theme_color: '#222222',
    background_color: '#222222',
    display: 'fullscreen',
    icons: [
      {
        src: 'android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: 'android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: 'android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),    
    VitePWA(vite_pwa_config), 
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),      
    }
  }
})
