import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/authStore'
import Prejoin from './Prejoin'
import Avatar from '../components/Avatar'
import ProfileModal from '../components/ProfileModal'
import LoginModal from '../components/LoginModal'
import GlowBackground from '../components/GlowBackground'
import { VideoIcon, LockIcon, KeyIcon, TelinkoLogo } from '../components/icons'
import { isReserved } from '../utils/room'

// Формат кастомного имени комнаты — совпадает с серверным CUSTOM_CODE_RE.
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/

function Home() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const [roomName, setRoomName] = useState('') // опциональное имя новой комнаты
  const [creating, setCreating] = useState(false) // показываем prejoin для создания
  const [createError, setCreateError] = useState(null)
  const [busy, setBusy] = useState(false) // идёт проверка имени/существования комнаты
  const [showProfile, setShowProfile] = useState(false) // модалка профиля (смена имени/аватара)
  const [showLogin, setShowLogin] = useState(false) // модалка входа/регистрации

  // Создать: проверяем ДО prejoin — формат имени и занятость, чтобы не гонять человека вводить
  // имя зря. Пусто → авто-код (проверять нечего). Всё ок → переходим в prejoin.
  async function startCreate() {
    setCreateError(null)
    const name = roomName.trim()
    if (name) {
      if (!CODE_RE.test(name)) {
        setCreateError('Имя: латиница/цифры/дефис/подчёркивание, 2–64 символа, без пробелов')
        return
      }
      if (isReserved(name)) {
        setCreateError('Это имя зарезервировано, выбери другое')
        return
      }
      setBusy(true)
      try {
        await api.get(`/api/rooms/${name}`) // 200 → комната уже есть → занято
        setCreateError('Комната с таким именем уже занята')
        setBusy(false)
        return
      } catch (err) {
        if (err?.response?.status !== 404) {
          setCreateError('Не удалось проверить имя. Попробуй ещё раз.')
          setBusy(false)
          return
        }
        setBusy(false) // 404 → имя свободно, продолжаем
      }
    }
    setCreating(true)
  }

  // Создать: сперва prejoin (имя + камера, там же заведётся гостевая сессия при необходимости),
  // затем создаём комнату (с опц. именем) и уходим в неё уже «вошедшими» (state.joined).
  async function handleCreateDone(prefs) {
    const name = roomName.trim()
    try {
      const res = await api.post('/api/rooms', name ? { code: name } : {})
      // Чистый URL комнаты: telinko.online/<code> (без /room/). Старый путь ещё работает алиасом.
      navigate(`/${res.data.room.code}`, { state: { joined: true, mediaPrefs: prefs } })
    } catch (err) {
      // 409 = имя заняли, пока мы были в prejoin (гонка: напр. создаём ту же комнату из двух вкладок).
      // Занятость проверяется ДО prejoin (startCreate); сюда попадаем лишь на гонке. Раз комната
      // теперь существует и мы хотели именно её — заходим в неё, а не выбрасываем «занято».
      if (err?.response?.status === 409 && name) {
        navigate(`/${name}`, { state: { joined: true, mediaPrefs: prefs } })
        return
      }
      setCreateError(err?.response?.data?.error || 'Не удалось создать комнату')
      setCreating(false) // назад к форме с ошибкой
    }
  }

  // Режим создания — показываем prejoin. Имя комнаты (если задано) — для читаемого заголовка.
  // «Выйти» → назад к форме Home (URL уже '/', поэтому navigate не поможет — сбрасываем creating).
  if (creating) {
    return (
      <Prejoin
        code={roomName.trim() || 'Новая встреча'}
        onJoin={handleCreateDone}
        onExit={() => setCreating(false)}
      />
    )
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-neutral-950 text-gray-100">
      <GlowBackground variant="home" />

      <div className="relative">
        {/* Шапка: бренд слева, статус входа справа. */}
        <header className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-5">
          <span className="-ml-1 flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:-ml-2">
            <TelinkoLogo className="h-10 w-10" />
            <span className="bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent">
              Telinko
            </span>
          </span>
          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProfile(true)}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-gray-300 transition hover:bg-neutral-800 hover:text-gray-100"
                title="Профиль — сменить имя или аватар"
              >
                <Avatar userId={user.id} name={user.displayName} size={28} hasAvatar={user.avatarVersion != null} version={user.avatarVersion} />
                <span className="text-sm">{user.displayName}</span>
              </button>
              <button onClick={logout} className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-neutral-800 hover:text-gray-100">
                Выйти
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
            >
              Войти
            </button>
          )}
        </header>

        <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-10 pb-16 sm:pt-16">
          {/* Hero */}
          <div className="mb-10 text-center sm:mb-14">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-sky-300 bg-clip-text text-transparent">
                Видеоконференции
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-gray-400 sm:text-lg">
              Защищенные видеозвонки в твоем браузере.
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {/* Видеозвонки: создать комнату (вход в комнату — только по ссылке). */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 backdrop-blur-sm">
              <div className="mb-5 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/20">
                  <VideoIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Новый видеозвонок</h2>
                  <p className="text-sm text-gray-400">Создай комнату и пригласи по ссылке</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="Имя комнаты (необязательно)"
                  value={roomName}
                  onChange={(e) => { setRoomName(e.target.value); setCreateError(null) }}
                  maxLength={64}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                />
                <button
                  onClick={startCreate}
                  disabled={busy}
                  className="rounded-lg bg-sky-600 px-5 py-2.5 font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                  Создать
                </button>
              </div>
              {createError && <p className="mt-2 text-sm text-red-400">{createError}</p>}
            </section>

            {/* Секретные ссылки. */}
            <Link
              to="/secret"
              className="group flex items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 backdrop-blur-sm transition hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-500/20">
                <LockIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">Секретная ссылка</div>
                <p className="mt-1 text-sm text-gray-400">
                  Одноразовое зашифрованное сообщение
                </p>
              </div>
              <span className="ml-auto shrink-0 text-lg text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-300">→</span>
            </Link>

            {/* Генератор ключей. */}
            <Link
              to="/keygen"
              className="group flex items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 backdrop-blur-sm transition hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/20">
                <KeyIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">Генератор ключей</div>
                <p className="mt-1 text-sm text-gray-400">
                  Случайные ключи и пароли
                </p>
              </div>
              <span className="ml-auto shrink-0 text-lg text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-300">→</span>
            </Link>
          </div>
        </main>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onSuccess={() => setShowLogin(false)} />
      )}
    </div>
  )
}

export default Home
