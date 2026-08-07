import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Home from './pages/Home' // лендинг — грузим сразу (первый экран, лёгкий)

// Остальные страницы — лениво (code-split): каждая уезжает в свой чанк и качается только при
// заходе на неё. Главное — Room тянет LiveKit (самый жирный кусок): теперь он НЕ в стартовом
// бандле, поэтому первый экран на мобилке (особенно iOS Safari) рисуется быстро, а не после ~1МБ.
const Room = lazy(() => import('./pages/Room'))
const SecretCreate = lazy(() => import('./pages/SecretCreate'))
const SecretView = lazy(() => import('./pages/SecretView'))
const KeyGen = lazy(() => import('./pages/KeyGen'))
const GithubOauthDone = lazy(() => import('./pages/GithubOauthDone'))

function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)

  // При старте приложения один раз проверяем сессию (есть ли живая cookie): узнаём, вошёл ли юзер,
  // чтобы шапка главной показывала профиль или кнопку «Войти».
  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return (
    // Suspense-фолбэк — тёмная заглушка (в тон теме), пока подгружается чанк ленивой страницы.
    // Не белый экран: на мобилке переход между страницами не мигает.
    <Suspense fallback={<div className="min-h-dvh bg-neutral-950" />}>
    <Routes>
      {/* Главная-лончер — публичная. Вход/регистрация — модалкой на самой главной (LoginModal),
          отдельных страниц /login и /register больше нет. */}
      <Route path="/" element={<Home />} />

      {/* Финал GitHub-OAuth: сюда сервер редиректит popup, страница закрывает окно. */}
      <Route path="/oauth/github" element={<GithubOauthDone />} />

      {/* Секретные ссылки — публичные. Создание + просмотр. */}
      <Route path="/secret" element={<SecretCreate />} />
      <Route path="/secret/:id" element={<SecretView />} />

      {/* Генератор ключей — публичный, полностью клиентский. */}
      <Route path="/keygen" element={<KeyGen />} />

      {/* Комната — ПУБЛИЧНАЯ: по ссылке заходит и гость без аккаунта. Личность (гость или
          реальный аккаунт) выясняет prejoin-экран: нет сессии → заводит гостя; есть cookie →
          входит собой.
          Чистый URL — telinko.online/<code> (path="/:code"). Статические роуты выше (/secret,
          /oauth…) ранжируются React Router'ом ВЫШЕ, поэтому /:code их не перехватывает; а имена
          комнат, совпадающие с этими путями, запрещены блэклистом на бэке (createRoom).
          /room/:code оставлен АЛИАСОМ — чтобы уже разосланные старые ссылки не умерли. */}
      <Route path="/:code" element={<Room />} />
      <Route path="/room/:code" element={<Room />} />

      {/* Неизвестный МНОГОсегментный адрес (одиночный сегмент уже съел /:code) → на главную */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

export default App
