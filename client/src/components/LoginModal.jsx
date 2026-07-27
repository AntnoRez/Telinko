import { useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { GithubIcon } from './icons'

// Модалка входа/регистрации: email+пароль (+имя при регистрации) или GitHub. Переключатель режима
// внизу — не нужно улетать на /register. onSuccess() зовём после успеха (стор обновит user).
// title/subtitle переопределяемы (переиспользуем в преджоине, «стать организатором» и т.п.).
export default function LoginModal({ onClose, onSuccess, title, subtitle, initialMode = 'login' }) {
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const loginWithGithub = useAuthStore((s) => s.loginWithGithub)

  const [mode, setMode] = useState(initialMode) // 'login' | 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [githubWaiting, setGithubWaiting] = useState(false) // открыт popup GitHub, ждём исхода
  const cancelledRef = useRef(false) // юзер нажал «Отмена» — игнорируем поздний результат popup

  const isRegister = mode === 'register'
  // Заголовок: в режиме регистрации всегда «Регистрация»; для входа — проп title (напр.
  // «Стать организатором»), иначе дефолт. Так title не перекрывает заголовок в обоих режимах.
  const heading = isRegister ? 'Регистрация' : title || 'Войти в аккаунт'

  const field =
    'rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500'

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSuccess()
    } catch (e) {
      // Серверную ошибку показываем как есть (email занят, пароль короткий, неверный логин…).
      setError(e?.response?.data?.error || 'Не получилось. Проверь данные и попробуй снова.')
      setBusy(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (isRegister) run(() => register(email.trim(), password, name.trim()))
    else run(() => login(email.trim(), password))
  }

  function switchMode() {
    setMode(isRegister ? 'login' : 'register')
    setError(null)
  }

  // GitHub-вход: закрытие popup мы детектить не можем (COOP рвёт popup.closed), поэтому пока ждём —
  // показываем подсказку с кнопкой «Отмена». Отмена сбрасывает ожидание, а поздний результат
  // (если popup всё же завершится/протухнет) игнорируем через cancelledRef.
  async function onGithub() {
    setError(null)
    setBusy(true)
    setGithubWaiting(true)
    cancelledRef.current = false
    try {
      await loginWithGithub()
      if (cancelledRef.current) return
      onSuccess()
    } catch (e) {
      if (cancelledRef.current) return
      setError(e?.response?.data?.error || 'Не получилось войти через GitHub.')
      setBusy(false)
      setGithubWaiting(false)
    }
  }

  function cancelGithub() {
    cancelledRef.current = true
    setBusy(false)
    setGithubWaiting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-gray-100 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200" aria-label="Закрыть">✕</button>
        </div>
        {subtitle && <p className="mb-4 text-sm text-gray-400">{subtitle}</p>}

        <form onSubmit={submit} className="flex flex-col gap-2">
          {isRegister && (
            <input
              type="text" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)}
              maxLength={50} className={field}
            />
          )}
          <input
            type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          <input
            type="password"
            placeholder={isRegister ? 'Пароль (минимум 6 символов)' : 'Пароль'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50">
            {isRegister ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        <div className="my-3 text-center text-xs text-gray-400">или</div>

        <button
          onClick={onGithub}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 font-medium text-gray-100 transition hover:bg-neutral-800 disabled:opacity-50"
        >
          <GithubIcon className="h-5 w-5" />
          {isRegister ? 'Регистрация через GitHub' : 'Войти через GitHub'}
        </button>

        {githubWaiting && (
          <p className="mt-2 text-center text-xs text-gray-400">
            Заверши вход в открывшемся окне GitHub…{' '}
            <button type="button" onClick={cancelGithub} className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2">
              Отмена
            </button>
          </p>
        )}

        <p className="mt-4 text-center text-xs text-gray-500">
          {isRegister ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <button type="button" onClick={switchMode} className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2">
            {isRegister ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </p>

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
