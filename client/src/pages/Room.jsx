import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { socket } from '../api/socket'
import { useAuthStore } from '../store/authStore'
import VideoCall from '../components/VideoCall'
import SecretCreateForm from '../components/SecretCreateForm'
import Prejoin from './Prejoin'
import CopyLinkButton from '../components/CopyLinkButton'
import ChatAttachMenu from '../components/ChatAttachMenu'
import EmojiPicker from '../components/EmojiPicker'
import ImageLightbox from '../components/ImageLightbox'
import VideoPlayer from '../components/VideoPlayer'
import Avatar from '../components/Avatar'
import { GithubIcon } from '../components/icons'
import { roomDisplayName } from '../utils/room'

// Время отправки в формате ЧЧ:ММ по локали браузера (напр. "14:05").
function formatTime(createdAt) {
  return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Разбить текст сообщения на куски и превратить http(s)-ссылки в кликабельные <a>.
// Строим React-элементы (не dangerouslySetInnerHTML) — XSS невозможен. Захватывающая группа
// в split оставляет сами ссылки в результате (нечётные индексы). break-all — чтобы длинные
// ссылки (секретки с #ключом) переносились, а не вылезали из пузыря.
const URL_RE = /(https?:\/\/[^\s]+)/g
function renderMessageText(text, mine) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline underline-offset-2 break-all ${mine ? 'text-indigo-100 hover:text-white' : 'text-indigo-300 hover:text-indigo-200'}`}
      >
        {part}
      </a>
    ) : (
      part
    ),
  )
}

// Ссылка на наш эндпоинт раздачи файла (MinIO приватный — только через него). Cookie уходит сам.
const API_BASE = import.meta.env.VITE_API_URL || ''
function attachmentUrl(code, messageId) {
  return `${API_BASE}/api/rooms/${code}/attachments/${messageId}`
}

// Человекочитаемый размер.
function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

// Иконка файла/скачивания.
const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
)

// Рендер вложения в сообщении: фото → картинка, видео → плеер, прочее → карточка «скачать».
function MessageAttachment({ code, message }) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const att = message.attachment
  if (!att) return null
  const url = attachmentUrl(code, message.id)
  const type = att.type || ''

  if (type.startsWith('image/')) {
    return (
      <>
        <img
          src={url}
          alt={att.name}
          onClick={() => setViewerOpen(true)}
          className="max-h-60 max-w-full cursor-zoom-in rounded-lg"
        />
        {viewerOpen && <ImageLightbox src={url} name={att.name} onClose={() => setViewerOpen(false)} />}
      </>
    )
  }
  if (type.startsWith('video/')) {
    return <VideoPlayer src={url} name={att.name} />
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-neutral-600 bg-black/20 px-3 py-2 hover:bg-black/30"
    >
      <FileIcon />
      <span className="min-w-0">
        <span className="block truncate text-sm">{att.name}</span>
        <span className="block text-[11px] opacity-70">{formatSize(att.size)}</span>
      </span>
    </a>
  )
}

// Геометрия боковых панелей (десктоп). Видео не должно ужиматься ниже VIDEO_MIN_WIDTH:
// максимальная ширина чата считается с учётом места под звонок и (если открыта) панель участников.
const VIDEO_MIN_WIDTH = 400 // px — минимальная ширина области звонка
const PARTICIPANTS_WIDTH = 320 // px — фикс. ширина панели участников (== sm:w-80)
const RESIZER_WIDTH = 6 // px — ширина перегородки (== w-1.5)

// Мини-иконки состояния/действий модерации (lucide-стиль, наследуют currentColor).
const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
)
const MicOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-1M12 19v3" /><path d="M2 2l20 20" /></svg>
)
const CamIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="13" height="12" rx="2" /><path d="M22 8l-7 4 7 4z" /></svg>
)
const CamOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16H5a2 2 0 0 1-2-2V8a2 2 0 0 1 .59-1.41M10 6h4a2 2 0 0 1 2 2v2m4-4v10l-4-3" /><path d="M2 2l20 20" /></svg>
)
const KickIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 17l5-5-5-5M21 12H9M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" /></svg>
)

// Модалка «Я организатор» для тех, кто ещё не реальный аккаунт (гость/аноним): либо войти
// существующими логином/паролем, либо через GitHub. После успеха — claim.
function OrganizerLogin({ onSuccess, onClose }) {
  const login = useAuthStore((s) => s.login)
  const loginWithGithub = useAuthStore((s) => s.loginWithGithub)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSuccess()
    } catch {
      setError('Не получилось. Проверь данные и попробуй снова.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-gray-100 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Стать организатором</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200" aria-label="Закрыть">✕</button>
        </div>
        <p className="mb-4 text-sm text-gray-400">Чтобы запустить звонок и управлять участниками, войдите.</p>

        <form
          onSubmit={(e) => { e.preventDefault(); run(() => login(email.trim(), password)) }}
          className="flex flex-col gap-2"
        >
          <input
            type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50">
            Войти
          </button>
        </form>

        <div className="my-3 text-center text-xs text-gray-400">или</div>

        <button
          onClick={() => run(() => loginWithGithub())}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 font-medium text-gray-100 transition hover:bg-neutral-800 disabled:opacity-50"
        >
          <GithubIcon className="h-5 w-5" />
          Войти через GitHub
        </button>

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}

function Room() {
  const { code } = useParams() // код комнаты из URL /room/:code
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const currentUserId = user?.id

  // Фаза: prejoin (экран имени) → checking (узнаём статус комнаты) → notfound |
  // waiting (ждём организатора) | call (звонок идёт). Пришли с create-флоу (state.joined) →
  // prejoin пропускаем (имя уже спросили при создании).
  const preJoined = location.state?.joined === true
  const [phase, setPhase] = useState(preJoined ? 'checking' : 'prejoin')
  const [mediaPrefs, setMediaPrefs] = useState(location.state?.mediaPrefs ?? { camOn: false, micOn: true })
  const [organizerId, setOrganizerId] = useState(null)
  const [startedAt, setStartedAt] = useState(null) // момент старта звонка (для таймера длительности)

  const [messages, setMessages] = useState([])
  const [participants, setParticipants] = useState([]) // кто сейчас онлайн в комнате
  const [text, setText] = useState('')
  const [pendingAtt, setPendingAtt] = useState(null) // загруженное вложение к отправке: { key,type,name,size,preview }
  const [uploading, setUploading] = useState(false)
  const [attachErr, setAttachErr] = useState(null)
  const [dragActive, setDragActive] = useState(false) // тащат файл над панелью чата
  const [showSecret, setShowSecret] = useState(false) // модалка создания секретки
  const [showOrgLogin, setShowOrgLogin] = useState(false) // модалка «стать организатором»
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState(null)
  // Чат (слева) и участники (справа) — независимые панели, могут быть открыты одновременно (как в Jitsi).
  const [chatOpen, setChatOpen] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [unread, setUnread] = useState(0) // непрочитанные сообщения, пока чат закрыт
  // Ширина левой панели чата (px), тянется перегородкой. Стартуем не меньше 1/5 экрана.
  const [chatWidth, setChatWidth] = useState(
    () => (typeof window !== 'undefined' ? Math.max(360, Math.round(window.innerWidth / 5)) : 360),
  )
  // Ширина окна — нужна, чтобы (а) знать десктоп/мобилку, (б) пересчитывать макс. ширину чата,
  // чтобы видео не ужималось ниже минимума. Обновляется на resize.
  const [winWidth, setWinWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  const chatOpenRef = useRef(false) // актуальное состояние чата для обработчика сокета (без stale-замыкания)
  const bottomRef = useRef(null)
  const inputRef = useRef(null) // поле ввода сообщения — для вставки эмодзи в позицию курсора
  const [liveParticipants, setLiveParticipants] = useState([]) // живой состав из LiveKit (мик/камера)
  // Стабильный колбэк для VideoCall — он репортит сюда живое состояние участников.
  const onLiveParticipants = useCallback((list) => setLiveParticipants(list), [])

  const entered = phase === 'waiting' || phase === 'call' // комната существует, мы внутри

  // 1. Узнаём статус комнаты после prejoin (или сразу, если пришли с create).
  useEffect(() => {
    if (phase !== 'checking') return
    let cancelled = false
    api
      .get(`/api/rooms/${code}`)
      .then((res) => {
        if (cancelled) return
        setOrganizerId(res.data.room.organizerId)
        setStartedAt(res.data.room.startedAt)
        setPhase(res.data.room.started ? 'call' : 'waiting')
      })
      .catch(() => {
        if (!cancelled) setPhase('notfound')
      })
    return () => { cancelled = true }
  }, [phase, code])

  // 2. Сокет: подключаем, как только комната существует (waiting/call). Слушаем старт звонка,
  //    сообщения и присутствие. Переход waiting→call соединение НЕ рвёт (entered остаётся true).
  useEffect(() => {
    if (!entered) return

    function onConnect() {
      socket.emit('room:join', code) // при обрыве/переподключении заново входим в комнату
    }
    function onStarted() {
      setPhase('call')
      // Обновляем organizerId (для проверки «я ли организатор» в модерации) и startedAt (таймер).
      api.get(`/api/rooms/${code}`).then((r) => {
        setOrganizerId(r.data.room.organizerId)
        setStartedAt(r.data.room.startedAt)
      }).catch(() => {})
    }
    function onNewMessage(msg) {
      setMessages((prev) => [...prev, msg])
      // Чат закрыт → считаем непрочитанные. Обработчик из замыкания, поэтому смотрим ref.
      if (!chatOpenRef.current) setUnread((n) => n + 1)
    }
    // История приходит от сервера на room:join (в т.ч. после реконнекта) — заменяем список
    // целиком: это авторитетные последние N сообщений, заодно re-sync после обрыва сети.
    function onHistory({ messages }) {
      setMessages(messages)
    }
    function onPresence({ participants }) {
      setParticipants(participants)
    }
    socket.on('connect', onConnect)
    socket.on('call:started', onStarted)
    socket.on('message:new', onNewMessage)
    socket.on('chat:history', onHistory)
    socket.on('presence:update', onPresence)
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('call:started', onStarted)
      socket.off('message:new', onNewMessage)
      socket.off('chat:history', onHistory)
      socket.off('presence:update', onPresence)
      socket.disconnect()
    }
  }, [entered, code])

  // Автоскролл вниз при каждом новом сообщении (bottomRef живёт только в открытом чате).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Синхроним ref с chatOpen (для onNewMessage). При открытии чата — гасим счётчик и скроллим вниз.
  useEffect(() => {
    chatOpenRef.current = chatOpen
    if (chatOpen) {
      setUnread(0)
      bottomRef.current?.scrollIntoView()
    }
  }, [chatOpen])

  // Следим за шириной окна (десктоп/мобилка + пересчёт лимитов ширины чата).
  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Тянем перегородку между чатом (слева) и видео. Чат прижат к левому краю окна, поэтому
  // его ширина = X курсора. Минимум — 1/5 окна; максимум оставляет место под звонок (VIDEO_MIN_WIDTH)
  // и под панель участников, если она открыта — чтобы видео не схлопывалось.
  function startChatResize(e) {
    e.preventDefault()
    function onMove(ev) {
      const min = window.innerWidth / 5
      const reserve = VIDEO_MIN_WIDTH + (participantsOpen ? PARTICIPANTS_WIDTH : 0) + RESIZER_WIDTH
      const max = window.innerWidth - reserve
      setChatWidth(Math.max(min, Math.min(max, ev.clientX)))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none' // не выделять текст во время перетаскивания
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handlePrejoinDone(prefs) {
    setMediaPrefs(prefs)
    setPhase('checking')
  }

  // «Я организатор»: реальный аккаунт → claim сразу; гость/аноним → сперва модалка входа.
  function handleClaimClick() {
    if (user && !user.guest) doClaim()
    else setShowOrgLogin(true)
  }

  async function doClaim() {
    setClaiming(true)
    setClaimError(null)
    try {
      const res = await api.post(`/api/rooms/${code}/claim-organizer`)
      setOrganizerId(res.data.organizerId)
      // Личность могла смениться (гость → аккаунт) → переподключаем сокет, чтобы presence и
      // авторство сообщений считались от нового аккаунта, а не от прежнего гостя.
      socket.disconnect()
      socket.connect()
      setPhase('call')
    } catch {
      setClaimError('Не удалось стать организатором')
    } finally {
      setClaiming(false)
    }
  }

  function handleSend(e) {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed && !pendingAtt) return // пусто и без вложения — не шлём
    const attachment = pendingAtt
      ? { key: pendingAtt.key, type: pendingAtt.type, name: pendingAtt.name, size: pendingAtt.size }
      : undefined
    socket.emit('message:send', { code, text: trimmed, attachment })
    setText('')
    clearPendingAtt()
  }

  // Вставить готовую ссылку секретки (из меню-скрепки) в поле сообщения — Антон дожмёт «отправить».
  function insertIntoMessage(url) {
    setText((t) => (t.trim() ? `${t.trim()} ${url}` : url))
  }

  // Вставить эмодзи в позицию курсора (или в конец, если поля/выделения нет), сохранив фокус.
  function insertEmoji(emoji) {
    const el = inputRef.current
    if (!el) {
      setText((t) => t + emoji)
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  // Выбрали файл в меню-скрепке → сразу грузим в MinIO (через наш бэк), держим как «черновик»
  // вложения; уйдёт при следующем handleSend. Для картинок делаем локальное превью (object URL).
  async function handlePickFile(file) {
    setAttachErr(null)
    setUploading(true)
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post(`/api/rooms/${code}/attachments`, form) // axios сам выставит multipart
      setPendingAtt({ ...res.data, preview }) // { key, type, name, size, preview }
    } catch (err) {
      if (preview) URL.revokeObjectURL(preview)
      setAttachErr(err.response?.data?.error || 'Не удалось загрузить файл')
    } finally {
      setUploading(false)
    }
  }

  function clearPendingAtt() {
    setPendingAtt((p) => {
      if (p?.preview) URL.revokeObjectURL(p.preview)
      return null
    })
    setAttachErr(null)
  }

  // Ctrl+V картинки/файла в поле ввода → грузим как вложение (берём первый файл).
  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.kind === 'file') {
        const file = it.getAsFile()
        if (file) {
          e.preventDefault() // не вставлять как «текст»
          handlePickFile(file)
          break
        }
      }
    }
  }

  // Drag&drop файла в панель чата. dragover обязан preventDefault, иначе drop не сработает.
  function onChatDragOver(e) {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault()
      setDragActive(true)
    }
  }
  function onChatDragLeave(e) {
    // Игнорируем переходы между вложенными детьми — гасим только при выходе за пределы панели.
    if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false)
  }
  function onChatDrop(e) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer?.files?.[0] // один файл на сообщение
    if (file) handlePickFile(file)
  }

  // Панели независимы — могут быть открыты одновременно (чат слева, участники справа).
  function toggleChat() {
    setChatOpen((v) => !v) // счётчик непрочитанных гасит эффект на [chatOpen]
  }
  function toggleParticipants() {
    setParticipantsOpen((v) => !v)
  }

  const roomName = roomDisplayName(code)
  const isOrganizer = currentUserId != null && currentUserId === organizerId

  const isDesktop = winWidth >= 640
  // Эффективная ширина чата: не больше, чем оставляет место под звонок (VIDEO_MIN_WIDTH) и
  // открытую панель участников. Клампим ПРИ РЕНДЕРЕ — открыл участников → чат сам поджался, видео цело.
  const maxChatWidth = winWidth - VIDEO_MIN_WIDTH - (participantsOpen ? PARTICIPANTS_WIDTH : 0) - RESIZER_WIDTH
  const effectiveChatWidth = Math.max(200, Math.min(chatWidth, maxChatWidth))

  // Действие модерации: дёргаем серверный эндпоинт (сервер сам проверит, что мы организатор,
  // и резолвит userId → LiveKit-identity). targetUserId — id юзера из presence.
  async function moderate(path, body) {
    try {
      await api.post(`/api/rooms/${code}/moderate/${path}`, body)
    } catch {
      // тихо; полноценные тосты об ошибках можно добавить позже
    }
  }

  // --- Экраны по фазам ---

  if (phase === 'prejoin') {
    // inviteUrl = ссылка на эту комнату: мы уже на /room/:code, комната существует → можно звать.
    return <Prejoin code={code} inviteUrl={window.location.href} onJoin={handlePrejoinDone} onExit={() => navigate('/')} />
  }

  if (phase === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-gray-400">
        Подключение…
      </div>
    )
  }

  if (phase === 'notfound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-neutral-950 text-gray-100">
        <p className="text-lg">Комната не найдена</p>
        <button onClick={() => navigate('/')} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500">
          На главную
        </button>
      </div>
    )
  }

  if (phase === 'waiting') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center gap-6 overflow-hidden bg-neutral-950 text-gray-100 px-4 text-center">
        {/* Индиго-свечение — единый тёмный вайб. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[140px]" />
        </div>

        <div className="relative">
          <h1 className="text-2xl sm:text-3xl font-semibold">Просьба присоединиться к встрече…</h1>
          <p className="mt-1 text-gray-400 truncate max-w-xs sm:max-w-md mx-auto">{roomName}</p>
        </div>
        <div className="relative h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-400" />
        <p className="relative max-w-md text-gray-300">
          Звонок ещё не начался, потому что не пришёл организатор. Хотите стать организатором —
          войдите. Иначе просто подождите.
        </p>
        <button
          onClick={handleClaimClick}
          disabled={claiming}
          className="relative rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {claiming ? 'Запускаем…' : 'Я организатор'}
        </button>
        {claimError && <p className="relative text-red-400 text-sm">{claimError}</p>}
        <CopyLinkButton
          url={window.location.href}
          label="Пригласить — копировать ссылку"
          className="relative text-sm text-gray-400 hover:text-white underline underline-offset-2"
        />
        <button onClick={() => navigate('/')} className="relative text-sm text-gray-500 hover:text-gray-300">
          Выйти
        </button>

        {showOrgLogin && (
          <OrganizerLogin
            onClose={() => setShowOrgLogin(false)}
            onSuccess={() => { setShowOrgLogin(false); doClaim() }}
          />
        )}
      </div>
    )
  }

  // phase === 'call' — звонок идёт. Раскладка как в Jitsi: видео на весь экран, ВСЕ контролы в
  // нижнем тулбаре (внутри VideoCall), шапки нет. Чат и участники — выезжающие сбоку панели.
  return (
    <div className="relative flex h-screen bg-black">
      {/* Чат — выезжает СЛЕВА (на мобилке оверлей поверх видео). Тёмная нейтральная тема, как плитки. */}
      {chatOpen && (
        <>
          <aside
            className="absolute inset-0 z-40 flex flex-col bg-neutral-900 text-gray-100 sm:relative sm:z-auto sm:inset-auto sm:shrink-0 border-r border-neutral-800"
            style={isDesktop ? { width: effectiveChatWidth } : undefined}
            onDragOver={onChatDragOver}
            onDragLeave={onChatDragLeave}
            onDrop={onChatDrop}
          >
            {dragActive && (
              <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-500 bg-neutral-900/85 pointer-events-none">
                <span className="text-sm font-medium text-indigo-300">Отпустите файл, чтобы прикрепить</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 shrink-0">
              <span className="text-sm font-medium">Чат</span>
              <button onClick={() => setChatOpen(false)} className="text-gray-500 hover:text-gray-200" aria-label="Закрыть чат">✕</button>
            </div>

            <div className="dark-scroll flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
              {messages.map((m) => {
                const mine = m.user.id === currentUserId
                // Содержимое пузыря — одинаково для своих/чужих; отличается обёртка (у чужих слева аватар).
                const bubble = (
                  <div
                    className={`rounded-lg px-3 py-2 ${
                      mine ? 'bg-indigo-600 text-white' : 'bg-neutral-800 border border-neutral-700'
                    }`}
                  >
                    {!mine && <div className="text-xs font-medium text-gray-400 mb-0.5">{m.user.displayName}</div>}
                    {m.text && <div className="whitespace-pre-wrap break-words">{renderMessageText(m.text, mine)}</div>}
                    {m.attachment && (
                      <div className={m.text ? 'mt-1.5' : ''}>
                        <MessageAttachment code={code} message={m} />
                      </div>
                    )}
                    <div className={`text-[10px] mt-0.5 text-right ${mine ? 'text-indigo-200' : 'text-gray-500'}`}>
                      {formatTime(m.createdAt)}
                    </div>
                  </div>
                )
                if (mine) {
                  return (
                    <div key={m.id} className="max-w-[85%] self-end">
                      {bubble}
                    </div>
                  )
                }
                return (
                  <div key={m.id} className="flex max-w-[85%] items-end gap-2 self-start">
                    <Avatar userId={m.user.id} name={m.user.displayName} size={28} />
                    <div className="min-w-0">{bubble}</div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Строка ввода — div, а не form: внутри скрепки живёт форма секретки, а вложенные
                формы невалидны. Отправка — по Enter и по кнопке. */}
            <div className="border-t border-neutral-800 shrink-0">
              {/* Черновик вложения / статус загрузки. */}
              {(uploading || pendingAtt || attachErr) && (
                <div className="px-3 pt-2">
                  {uploading && <div className="text-xs text-gray-400">Загрузка…</div>}
                  {attachErr && <div className="text-xs text-red-400">{attachErr}</div>}
                  {pendingAtt && (
                    <div className="flex items-center gap-2 rounded-lg bg-neutral-800 px-2 py-1.5">
                      {pendingAtt.preview ? (
                        <img src={pendingAtt.preview} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <span className="text-gray-400">
                          <FileIcon />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-gray-200">{pendingAtt.name}</span>
                        <span className="block text-[10px] text-gray-500">{formatSize(pendingAtt.size)}</span>
                      </span>
                      <button type="button" onClick={clearPendingAtt} className="shrink-0 text-gray-500 hover:text-gray-200" aria-label="Убрать вложение">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1 px-3 py-3">
                <ChatAttachMenu onSecretLink={insertIntoMessage} onPickFile={handlePickFile} />
                <EmojiPicker onPick={insertEmoji} />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Сообщение…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  className="flex-1 ml-1 bg-neutral-800 border border-neutral-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
                  title="Отправить"
                  aria-label="Отправить"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </aside>

          {/* Перетаскиваемая перегородка (только десктоп). */}
          <div
            onMouseDown={startChatResize}
            className="hidden sm:block w-1.5 shrink-0 cursor-col-resize bg-neutral-800 hover:bg-indigo-500 transition-colors"
            title="Потяни, чтобы изменить ширину чата"
          />
        </>
      )}

      <div className="min-w-0 flex-1">
        <VideoCall
          code={code}
          mediaPrefs={mediaPrefs}
          startedAt={startedAt}
          onLeave={() => navigate('/')}
          unread={unread}
          onToggleChat={toggleChat}
          onToggleParticipants={toggleParticipants}
          onOpenSecret={() => setShowSecret(true)}
          inviteUrl={window.location.href}
          onLiveParticipants={onLiveParticipants}
        />
      </div>

      {/* Участники — выезжает справа. Та же тёмная нейтральная тема, что и чат. */}
      {participantsOpen && (
        <aside className="absolute inset-0 z-40 flex flex-col bg-neutral-900 text-gray-100 sm:static sm:z-auto sm:w-80 sm:shrink-0 border-l border-neutral-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
            <span className="font-medium">Участники ({liveParticipants.length})</span>
            <button onClick={() => setParticipantsOpen(false)} className="text-gray-500 hover:text-gray-200" aria-label="Закрыть">✕</button>
          </div>
          <div className="px-4 py-3 shrink-0">
            <CopyLinkButton
              url={window.location.href}
              label="Пригласить"
              className="block w-full rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-500"
            />
          </div>
          <ul className="dark-scroll flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1">
            {liveParticipants.map((p) => {
              // Иконки показывают РЕАЛЬНОЕ состояние (live из LiveKit). Организатору клик по чужому:
              // включено → выключаем (server mute); выключено → шлём запрос на включение (ask-unmute).
              const canModerate = isOrganizer && !p.isLocal
              return (
                <li key={p.identity} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-neutral-800">
                  <Avatar userId={p.userId} name={p.name} size={32} />
                  <span className="flex-1 truncate text-sm">
                    {p.name}
                    {p.isLocal && ' (вы)'}
                    {p.userId === organizerId && <span className="ml-1 text-xs text-gray-400">· организатор</span>}
                  </span>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      disabled={!canModerate}
                      title={
                        !canModerate
                          ? p.micOn ? 'Микрофон включён' : 'Микрофон выключен'
                          : p.micOn ? 'Выключить микрофон' : 'Попросить включить микрофон'
                      }
                      onClick={() =>
                        p.micOn
                          ? moderate('mute', { targetUserId: p.userId, source: 'microphone' })
                          : moderate('ask-unmute', { targetUserId: p.userId, source: 'microphone' })
                      }
                      className={`rounded p-1 ${p.micOn ? 'text-gray-300' : 'text-red-500'} ${canModerate ? 'hover:bg-neutral-700' : 'cursor-default'}`}
                    >
                      {p.micOn ? <MicIcon /> : <MicOffIcon />}
                    </button>

                    <button
                      disabled={!canModerate}
                      title={
                        !canModerate
                          ? p.camOn ? 'Камера включена' : 'Камера выключена'
                          : p.camOn ? 'Выключить камеру' : 'Попросить включить камеру'
                      }
                      onClick={() =>
                        p.camOn
                          ? moderate('mute', { targetUserId: p.userId, source: 'camera' })
                          : moderate('ask-unmute', { targetUserId: p.userId, source: 'camera' })
                      }
                      className={`rounded p-1 ${p.camOn ? 'text-gray-300' : 'text-red-500'} ${canModerate ? 'hover:bg-neutral-700' : 'cursor-default'}`}
                    >
                      {p.camOn ? <CamIcon /> : <CamOffIcon />}
                    </button>

                    {canModerate && (
                      <button
                        title="Выгнать из звонка"
                        onClick={() => moderate('kick', { targetUserId: p.userId })}
                        className="rounded p-1 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <KickIcon />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </aside>
      )}

      {showSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSecret(false)}>
          <div className="dark-scroll w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6 shadow-xl text-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Секретная ссылка</h2>
              <button onClick={() => setShowSecret(false)} className="text-gray-500 hover:text-gray-200" aria-label="Закрыть">✕</button>
            </div>
            <SecretCreateForm dark />
          </div>
        </div>
      )}
    </div>
  )
}

export default Room
