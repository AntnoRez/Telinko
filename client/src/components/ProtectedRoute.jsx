import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Обёртка для страниц, куда пускаем только авторизованных.
// Использование: <ProtectedRoute><Home /></ProtectedRoute>
function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const location = useLocation() // где юзер сейчас (напр. /room/abc-d2f)

  // Пока идёт первичная проверка сессии (fetchMe ещё не ответил) — НЕ решаем,
  // авторизован юзер или нет. Иначе на F5 выкинуло бы на /login до ответа сервера.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Загрузка…
      </div>
    )
  }

  // Проверка закончилась, юзера нет → отправляем на вход.
  // В redirect кладём путь, куда юзер шёл (напр. /room/abc-d2f), чтобы после
  // логина/реги вернуть его именно туда, а не на главную.
  // replace — заменяем текущую запись в истории, чтобы кнопка "назад"
  // не возвращала на защищённую страницу.
  if (!user) {
    const redirect = encodeURIComponent(location.pathname)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  // Всё хорошо — показываем защищённое содержимое.
  return children
}

export default ProtectedRoute
