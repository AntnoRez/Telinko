import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { VideoIcon, LockIcon } from '../components/icons'

// Инструменты платформы. Массив — чтобы добавлять новые плитки одной строкой.
// requiresAuth: true → плитка ведёт на защищённый роут (ProtectedRoute сам уведёт на вход).
const tools = [
  {
    key: 'video',
    title: 'Видео звонки',
    desc: 'Групповые звонки до 15 человек с чатом и демонстрацией экрана',
    Icon: VideoIcon,
    accent: 'bg-gray-100',
    path: '/video',
    requiresAuth: true,
  },
  {
    key: 'secret',
    title: 'Секретные ссылки',
    desc: 'Одноразовые зашифрованные сообщения — сгорают после прочтения',
    Icon: LockIcon,
    accent: 'bg-gray-100',
    path: '/secret',
    requiresAuth: false,
  },
]

function Home() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Шапка платформы: слева название, справа статус входа. */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <span className="text-lg font-semibold">Инструменты</span>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user.displayName}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-red-600"
            >
              Выйти
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Войти
          </Link>
        )}
      </header>

      {/* Сетка плиток: 1 колонка на телефоне, 2 на планшете, 3 на десктопе. */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Выбери инструмент</h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const locked = tool.requiresAuth && !user
            return (
              <Link
                key={tool.key}
                to={tool.path}
                className="group relative flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                {/* Иконка в скруглённом квадрате — плоский монохромный SVG. */}
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-gray-700 ${tool.accent}`}>
                  <tool.Icon className="w-6 h-6" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tool.title}</span>
                    {locked && (
                      <span className="text-gray-400" title="Нужен вход">
                        <LockIcon className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{tool.desc}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}

export default Home
