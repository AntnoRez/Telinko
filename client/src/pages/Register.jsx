import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { safeRedirect } from '../utils/redirect'
import { TelinkoLogo } from '../components/icons'

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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-neutral-950 px-4 text-gray-100">
      {/* Индиго-свечение — единый тёмный вайб. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[140px]" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-xl backdrop-blur-sm flex flex-col gap-4"
      >
        <Link to="/" className="mb-2 flex items-center justify-center gap-2">
          <TelinkoLogo className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Telinko
          </span>
        </Link>
        <h1 className="text-center text-2xl font-semibold">Регистрация</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="text"
          placeholder="Имя"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          placeholder="Пароль (мин. 6 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Создаём…' : 'Зарегистрироваться'}
        </button>

        <p className="text-sm text-gray-400 text-center">
          Уже есть аккаунт?{' '}
          <Link
            to={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}
            className="text-indigo-400 hover:underline"
          >
            Войти
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Register
