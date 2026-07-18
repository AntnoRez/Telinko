import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { safeRedirect } from '../utils/redirect'

function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
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
