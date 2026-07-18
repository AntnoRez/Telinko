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

      {/* Видео-инструмент: только для авторизованных. Лобби переехало /lobby → /video,
          ссылки на комнаты /room/:code оставлены как есть (короткие, шарятся). */}
      <Route
        path="/video"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/room/:code"
        element={
          <ProtectedRoute>
            <Room />
          </ProtectedRoute>
        }
      />

      {/* Секретные ссылки — публичные. Создание + просмотр. */}
      <Route path="/secret" element={<SecretCreate />} />
      <Route path="/secret/:id" element={<SecretView />} />

      {/* Любой неизвестный адрес → на главную */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
