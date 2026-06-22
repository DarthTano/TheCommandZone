import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// chronicler=5173, gridiron=5174, manaforge=5175
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
})
