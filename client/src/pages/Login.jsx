import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { safeRedirect } from '../utils/redirect'
import { GithubIcon } from '../components/icons'

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white p-8 rounded-xl shadow flex flex-col gap-4"
      >
        <h1 className="text-2xl font-semibold text-gray-800">Вход</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="password"
          placeholder="Пароль"
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
          {submitting ? 'Входим…' : 'Войти'}
        </button>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" /> или <span className="h-px flex-1 bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={handleGithub}
          disabled={submitting}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 py-2 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          <GithubIcon className="w-5 h-5" />
          Войти через GitHub
        </button>

        <p className="text-sm text-gray-500 text-center">
          Нет аккаунта?{' '}
          <Link
            to={redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : '/register'}
            className="text-blue-600 hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Login
