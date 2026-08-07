import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // autoUpdate: новый SW активируется сам и берёт контроль → после деплоя пользователи
      // получают свежую версию без ручного «обновить» (важно, деплоим часто).
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Telinko — видеозвонки',
        short_name: 'Telinko',
        description: 'Видеозвонки, чат и секретные ссылки в браузере',
        lang: 'ru',
        display: 'standalone',
        start_url: '/',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Прекэш собранной статики (по хэшам — авто-инвалидация на каждый деплой).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // SPA: неизвестный путь навигации → index.html. Но НЕ для realtime/API — их отдаёт сеть.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/, /^\/livekit/],
        // /api НЕ кэшируем СОЗНАТЕЛЬНО: приватные ответы (профиль, комнаты, аватары) не должны
        // оседать в CacheStorage (не чистится при logout → утечка на общем устройстве). Правил
        // runtimeCaching нет → все /api, socket.io и LiveKit (ws/webrtc) идут в сеть мимо SW.
        // Кэшируется только публичная статика (app shell) через precache выше.
      },
      devOptions: { enabled: false }, // в dev SW не мешает (иначе кэширует hot-модули)
    }),
  ],
})
