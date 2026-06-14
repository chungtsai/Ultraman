import { defineConfig } from 'vite'

export default defineConfig({
  // 使用相對路徑，確保專案部署到 GitHub Pages (https://<username>.github.io/<repo>/) 時資源能被正確載入
  base: './'
})
