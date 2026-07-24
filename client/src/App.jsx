import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Lobby from './pages/Lobby'
import Room from './pages/Room'
import SecretCreate from './pages/SecretCreate'
import SecretView from './pages/SecretView'
import GithubOauthDone from './pages/GithubOauthDone'

function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)

  // При старте приложения один раз проверяем сессию (есть ли живая cookie).
  // Пока fetchMe не ответил, стор держит loading: true, и ProtectedRoute показывает "Загрузка…".
  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  return (
    <Routes>
      {/* Главная-лончер — публичная */}
      <Route path="/" element={<Home />} />

      {/* Публичные страницы */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Лобби (создать комнату / войти по коду) — только для авторизованных реальных
          аккаунтов: создавать комнаты может лишь не-гость (он же станет модератором). */}
      <Route
        path="/video"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      {/* Комната — ПУБЛИЧНАЯ: по ссылке заходит и гость без аккаунта. Личность (гость или
          реальный аккаунт) выясняет prejoin-экран (Фаза 2): нет сессии → заводит гостя;
          есть cookie → входит собой. Поэтому ProtectedRoute здесь НЕ нужен. */}
      <Route path="/room/:code" element={<Room />} />

      {/* Финал GitHub-OAuth: сюда сервер редиректит popup, страница закрывает окно. */}
      <Route path="/oauth/github" element={<GithubOauthDone />} />

      {/* Секретные ссылки — публичные. Создание + просмотр. */}
      <Route path="/secret" element={<SecretCreate />} />
      <Route path="/secret/:id" element={<SecretView />} />

      {/* Любой неизвестный адрес → на главную */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
