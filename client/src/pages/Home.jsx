import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { extractRoomCode } from '../utils/room'
import Prejoin from './Prejoin'
import { VideoIcon, LockIcon } from '../components/icons'

// Формат кастомного имени комнаты — совпадает с серверным CUSTOM_CODE_RE.
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/

function Home() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const [roomName, setRoomName] = useState('') // опциональное имя новой комнаты
  const [joinInput, setJoinInput] = useState('') // код ИЛИ полная ссылка
  const [joinError, setJoinError] = useState(null)
  const [creating, setCreating] = useState(false) // показываем prejoin для создания
  const [createError, setCreateError] = useState(null)
  const [busy, setBusy] = useState(false) // идёт проверка имени/существования комнаты

  // Присоединиться: принимаем и код, и ссылку. Существование проверяем ЗДЕСЬ (публичный GET),
  // чтобы «не найдена» показать сразу, а не после prejoin.
  async function handleJoin(e) {
    e.preventDefault()
    setJoinError(null)
    const code = extractRoomCode(joinInput)
    if (!code) {
      setJoinError('Вставь код комнаты или ссылку')
      return
    }
    setBusy(true)
    try {
      await api.get(`/api/rooms/${code}`) // 200 → есть, идём в комнату (prejoin внутри Room)
      navigate(`/room/${code}`)
    } catch (err) {
      setJoinError(err?.response?.status === 404 ? 'Комната не найдена' : 'Не удалось проверить комнату')
      setBusy(false)
    }
  }

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
    try {
      const name = roomName.trim()
      const res = await api.post('/api/rooms', name ? { code: name } : {})
      navigate(`/room/${res.data.room.code}`, { state: { joined: true, mediaPrefs: prefs } })
    } catch (err) {
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
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Шапка: слева название, справа статус входа. */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <span className="text-lg font-semibold">Инструменты</span>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user.displayName}</span>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-red-600">
              Выйти
            </button>
          </div>
        ) : (
          <Link to="/login" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Войти
          </Link>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* Видеозвонки: создать / присоединиться (публично, без обязательного входа). */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
              <VideoIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Видеозвонки</h1>
              <p className="text-sm text-gray-500">Групповые звонки с чатом и демонстрацией экрана</p>
            </div>
          </div>

          {/* Создать */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Имя комнаты (необязательно)"
              value={roomName}
              onChange={(e) => { setRoomName(e.target.value); setCreateError(null) }}
              maxLength={64}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={startCreate}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Создать
            </button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}

          <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" /> или <span className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Присоединиться */}
          <form onSubmit={handleJoin} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Код комнаты или ссылка"
              value={joinInput}
              onChange={(e) => { setJoinInput(e.target.value); setJoinError(null) }}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button type="submit" disabled={busy} className="rounded-lg bg-gray-200 px-5 py-2 font-medium text-gray-800 hover:bg-gray-300 disabled:opacity-50">
              Присоединиться
            </button>
          </form>
          {joinError && <p className="mt-2 text-sm text-red-600">{joinError}</p>}
        </section>

        {/* Секретные ссылки — как было. */}
        <Link
          to="/secret"
          className="flex items-center gap-3 rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
            <LockIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="font-medium">Секретные ссылки</div>
            <p className="mt-1 text-sm text-gray-500">
              Одноразовые зашифрованные сообщения — сгорают после прочтения
            </p>
          </div>
        </Link>
      </main>
    </div>
  )
}

export default Home
