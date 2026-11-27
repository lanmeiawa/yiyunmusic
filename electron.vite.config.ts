import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['NeteaseCloudMusicApi', /^NeteaseCloudMusicApi\//]
      }
    }
  },
  preload: {},
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      // Electron 33 内置 Chromium 130，直接按它编译，少做无用的降级转换
      target: 'chrome130',
      reportCompressedSize: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          lyrics: resolve(__dirname, 'src/renderer/lyrics.html')
        }
      }
    }
  }
})
