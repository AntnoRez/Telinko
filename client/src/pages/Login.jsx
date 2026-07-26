import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { safeRedirect } from '../utils/redirect'
import { GithubIcon, TelinkoLogo } from '../components/icons'

function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const loginWithGithub = useAuthStore((s) => s.loginWithGithub)
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') // куда вернуть после входа (или null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(safeRedirect(redirect)) // успех → куда шёл (комната) или на главную
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось войти')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGithub() {
    setError(null)
    setSubmitting(true)
    try {
      await loginWithGithub()
      navigate(safeRedirect(redirect)) // успех → куда шёл (комната) или на главную
    } catch (err) {
      // Закрытое окно — это не ошибка входа, не пугаем красным текстом.
      if (err?.message !== 'Окно GitHub закрыто') setError('Не удалось войти через GitHub')
      setSubmitting(false)
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
        <h1 className="text-center text-2xl font-semibold">Вход</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          placeholder="Пароль"
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
          {submitting ? 'Входим…' : 'Войти'}
        </button>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="h-px flex-1 bg-neutral-800" /> или <span className="h-px flex-1 bg-neutral-800" />
        </div>

        <button
          type="button"
          onClick={handleGithub}
          disabled={submitting}
          className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 py-2 font-medium text-gray-100 transition hover:bg-neutral-800 disabled:opacity-50"
        >
          <GithubIcon className="w-5 h-5" />
          Войти через GitHub
        </button>

        <p className="text-sm text-gray-400 text-center">
          Нет аккаунта?{' '}
          <Link
            to={redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register'}
            className="text-indigo-400 hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Login
