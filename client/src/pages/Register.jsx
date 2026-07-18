import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { safeRedirect } from '../utils/redirect'

function Register() {
  const navigate = useNavigate()
  // Берём из стора только метод register (подписка на конкретное поле — так компонент
  // не перерисовывается на изменения других частей стора).
  const register = useAuthStore((s) => s.register)
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') // куда вернуть после реги (или null)

  // Поля формы — «контролируемые»: значение живёт в стейте, input его лишь отображает.
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault() // отменяем стандартную перезагрузку страницы при сабмите формы
    setError(null)
    setSubmitting(true)
    try {
      await register(email, password, displayName)
      navigate(safeRedirect(redirect)) // успех → куда шёл (комната) или на главную
    } catch (err) {
      // текст ошибки бэк кладёт в { error: '...' } → достаём его
      setError(err.response?.data?.error || 'Не удалось зарегистрироваться')
    } finally {
      setSubmitting(false) // в любом случае снимаем блокировку кнопки
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white p-8 rounded-xl shadow flex flex-col gap-4"
      >
        <h1 className="text-2xl font-semibold text-gray-800">Регистрация</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="text"
          placeholder="Имя"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="password"
          placeholder="Пароль (мин. 6 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Создаём…' : 'Зарегистрироваться'}
        </button>

        <p className="text-sm text-gray-500 text-center">
          Уже есть аккаунт?{' '}
          <Link
            to={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
            className="text-blue-600 hover:underline"
          >
            Войти
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Register
