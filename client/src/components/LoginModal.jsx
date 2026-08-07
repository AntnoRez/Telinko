import { useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { GithubIcon } from './icons'

// Модалка входа/регистрации: email+пароль (+имя при регистрации) или GitHub. Переключатель режима
// внизу — не нужно улетать на /register. onSuccess() зовём после успеха (стор обновит user).
// title/subtitle переопределяемы (переиспользуем в преджоине, «стать организатором» и т.п.).
export default function LoginModal({ onClose, onSuccess, title, subtitle, initialMode = 'login', initialName = '' }) {
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const loginWithGithub = useAuthStore((s) => s.loginWithGithub)
  const quick = useAuthStore((s) => s.quick)

  const [mode, setMode] = useState(initialMode) // 'login' | 'register'
  const [name, setName] = useState(initialName) // предзаполняем именем из преджоина, если было
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [githubWaiting, setGithubWaiting] = useState(false) // открыт popup GitHub, ждём исхода
  const cancelledRef = useRef(false) // юзер нажал «Отмена» — игнорируем поздний результат popup
  const [creds, setCreds] = useState(null) // { email, password } после one-click — показываем ОДИН раз
  const [quickAsking, setQuickAsking] = useState(false) // экран ввода имени для one-click
  const [showPass, setShowPass] = useState(false) // показать выданный пароль текстом (глазик)

  const isRegister = mode === 'register'
  // Заголовок: в режиме регистрации всегда «Регистрация»; для входа — проп title (напр.
  // «Стать организатором»), иначе дефолт. Так title не перекрывает заголовок в обоих режимах.
  const heading = isRegister ? 'Регистрация' : title || 'Войти в аккаунт'

  const field =
    'rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500'

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

  // One-click: сервер сам заводит реальный аккаунт (случайные email+пароль) и логинит. Юзер уже
  // вошёл (стор обновлён), но выданные доступы показываем ОДИН раз — иначе вернуться не сможет.
  async function onQuick() {
    setBusy(true)
    setError(null)
    try {
      const c = await quick(name.trim(), false) // имя опц.; temporary=false → постоянный аккаунт
      setBusy(false)
      setQuickAsking(false) // уходим с экрана ввода имени
      setCreds(c) // показываем доступы; onSuccess зовём после «Продолжить»
    } catch (e) {
      setError(e?.response?.data?.error || 'Не удалось создать аккаунт одним кликом.')
      setBusy(false)
    }
  }

  // Предложить браузеру запомнить выданные доступы. Основной путь — Credential Management API
  // (Chromium, secure context); где его нет (Firefox/Safari) — сработает форма с autocomplete ниже.
  async function rememberInBrowser() {
    if (typeof window !== 'undefined' && 'PasswordCredential' in window && navigator.credentials) {
      try {
        const cred = new window.PasswordCredential({
          id: creds.email,
          password: creds.password,
          name: creds.email,
        })
        await navigator.credentials.store(cred)
      } catch {
        // браузер отказал/не поддержал — не критично, юзер сохранит вручную
      }
    }
  }

  // «Сохранил — продолжить»: сабмит формы доступов → просим браузер запомнить → закрываем.
  async function finishCreds(e) {
    e?.preventDefault()
    await rememberInBrowser()
    onSuccess()
  }

  // Экран ввода имени для one-click. Имя предзаполнено (из преджоина), можно поправить.
  if (quickAsking) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-gray-100 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Быстрый аккаунт</h2>
            <button onClick={() => setQuickAsking(false)} className="text-xs text-gray-500 hover:text-gray-200">← назад</button>
          </div>
          <p className="mb-4 text-sm text-gray-400">
            Под этим именем тебя увидят в чате и звонке. Аккаунт создастся автоматически — логин и пароль выдадим следом.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); onQuick() }} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Твоё имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
              className={field}
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? 'Создаём…' : 'Создать аккаунт'}
            </button>
          </form>
          {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
        </div>
      </div>
    )
  }

  // Экран выданных доступов (после one-click). Юзер уже залогинен — «Продолжить» просто закрывает.
  if (creds) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-gray-100 shadow-xl">
          <h2 className="mb-2 text-lg font-semibold">Аккаунт создан</h2>
          <p className="mb-4 text-sm text-gray-400">
            Сохрани эти доступы — войти в этот аккаунт снова можно только ими. Больше мы их не покажем.
            Нажми «Продолжить» — браузер предложит запомнить пароль.
          </p>
          {/* Настоящая форма с autocomplete: даёт браузеру поймать пару логин/пароль для сохранения. */}
          <form onSubmit={finishCreds} className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">Email</label>
            <input
              readOnly
              name="username"
              autoComplete="username"
              value={creds.email}
              onFocus={(e) => e.target.select()}
              className={`${field} font-mono text-sm`}
            />
            <label className="mt-1 text-xs text-gray-500">Пароль</label>
            <div className="relative">
              <input
                readOnly
                name="password"
                autoComplete="new-password"
                type={showPass ? 'text' : 'password'}
                value={creds.password}
                onFocus={(e) => e.target.select()}
                className={`${field} w-full pr-16 font-mono text-sm`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200"
              >
                {showPass ? 'Скрыть' : 'Показать'}
              </button>
            </div>
            <button
              type="submit"
              className="mt-3 w-full rounded-lg bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-500"
            >
              Сохранил — продолжить
            </button>
          </form>
        </div>
      </div>
    )
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
          <button type="submit" disabled={busy} className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white transition hover:bg-sky-500 disabled:opacity-50">
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
            <button type="button" onClick={cancelGithub} className="text-sky-300 hover:text-sky-200 underline underline-offset-2">
              Отмена
            </button>
          </p>
        )}

        {/* One-click: спросим имя, дальше сервер сам заведёт аккаунт и выдаст доступы. */}
        <button
          onClick={() => { setError(null); setQuickAsking(true) }}
          disabled={busy}
          className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-gray-400 transition hover:bg-neutral-800 hover:text-gray-100 disabled:opacity-50"
        >
          Продолжить одним кликом
        </button>

        <p className="mt-4 text-center text-xs text-gray-500">
          {isRegister ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <button type="button" onClick={switchMode} className="text-sky-300 hover:text-sky-200 underline underline-offset-2">
            {isRegister ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </p>

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
