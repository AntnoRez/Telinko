import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { socket } from '../api/socket'
import { useAuthStore } from '../store/authStore'
import VideoCall from '../components/VideoCall'
import SecretCreateForm from '../components/SecretCreateForm'
import { LockIcon } from '../components/icons'

// Время отправки в формате ЧЧ:ММ по локали браузера (напр. "14:05").
function formatTime(createdAt) {
  return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function Room() {
  const { code } = useParams() // код комнаты из URL /room/:code
  const navigate = useNavigate()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const [messages, setMessages] = useState([])
  const [participants, setParticipants] = useState([]) // кто сейчас онлайн в комнате
  const [text, setText] = useState('')
  const [status, setStatus] = useState('loading') // loading | ready | notfound
  const [inCall, setInCall] = useState(false) // зашли ли в видеозвонок
  const [copied, setCopied] = useState(false) // показать "Скопировано!" после копирования
  const [showSecret, setShowSecret] = useState(false) // модалка создания секретки
  const bottomRef = useRef(null) // якорь внизу списка для автоскролла

  // Загрузка истории + подключение сокета. Перезапускается при смене кода комнаты.
  useEffect(() => {
    let cancelled = false // защита от setState после ухода со страницы

    // 1. Грузим историю по REST (заодно проверяем, что комната существует)
    async function loadHistory() {
      try {
        const res = await api.get(`/api/rooms/${code}/messages`)
        if (cancelled) return
        setMessages(res.data.messages)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('notfound')
      }
    }
    loadHistory()

    // 2. Реалтайм. room:join шлём внутри 'connect' — чтобы при обрыве и
    // авто-переподключении сокет заново входил в комнату.
    function onConnect() {
      socket.emit('room:join', code)
    }
    function onNewMessage(msg) {
      setMessages((prev) => [...prev, msg])
    }
    // Сервер шлёт полный состав комнаты при каждом изменении — просто заменяем список.
    function onPresence({ participants }) {
      setParticipants(participants)
    }
    socket.on('connect', onConnect)
    socket.on('message:new', onNewMessage)
    socket.on('presence:update', onPresence)
    socket.connect()

    // 3. Уборка при уходе со страницы: снимаем слушателей и рвём соединение.
    return () => {
      cancelled = true
      socket.off('connect', onConnect)
      socket.off('message:new', onNewMessage)
      socket.off('presence:update', onPresence)
      socket.disconnect()
    }
  }, [code])

  // Автоскролл вниз при каждом новом сообщении
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(e) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    // Локально сообщение НЕ добавляем — сервер пришлёт его нам обратно через
    // 'message:new' (io.to шлёт всем в комнате, включая отправителя).
    socket.emit('message:send', { code, text: trimmed })
    setText('')
  }

  // Копируем ссылку на текущую комнату (полный URL) в буфер обмена.
  // navigator.clipboard работает в защищённом контексте — https или localhost (у нас dev = ок).
  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000) // вернуть подпись кнопки через 2 сек
    } catch {
      // буфер недоступен (нет разрешения/не защищённый контекст) — тихо игнорируем
    }
  }

  if (status === 'notfound') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 text-gray-800">
        <p className="text-lg">Комната не найдена</p>
        <button
          onClick={() => navigate('/video')}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-blue-700"
        >
          В лобби
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800">
      {/* Шапка: код комнаты + участники онлайн + выход из комнаты (НЕ logout).
          flex-wrap — на узком экране кнопки переносятся на новую строку, а не вылезают. */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-gray-500">
              Комната: <span className="text-gray-800">{code}</span>
            </span>
            <button
              onClick={handleCopyLink}
              className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-0.5"
            >
              {copied ? 'Скопировано!' : 'Скопировать ссылку'}
            </button>
          </div>
          <span className="text-xs text-gray-400" title={participants.map((p) => p.displayName).join(', ')}>
            Онлайн: {participants.length}
            {participants.length > 0 && ` — ${participants.map((p) => p.displayName).join(', ')}`}
          </span>
        </div>
        {/* w-full sm:w-auto — на мобилке группа занимает всю ширину строки, чтобы
            ml-auto у «Покинуть» отодвинул её вправо. На десктопе — обычное расположение. */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
          {!inCall && (
            <button
              onClick={() => setInCall(true)}
              className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700"
            >
              Войти в звонок
            </button>
          )}
          <button
            onClick={() => setShowSecret(true)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
            title="Создать секретную ссылку, не выходя из звонка"
          >
            <LockIcon className="w-4 h-4" /> Секретка
          </button>
          <button
            onClick={() => navigate('/video')}
            className="ml-auto sm:ml-0 text-sm text-gray-500 hover:text-red-600"
          >
            Покинуть комнату
          </button>
        </div>
      </header>

      {/* Панель видеозвонка. Появляется по кнопке; выход из звонка (кнопка в панели
          LiveKit) дёргает onLeave → прячем панель, комната с чатом остаётся. */}
      {inCall && (
        <div className="h-[60vh] border-b border-gray-200 bg-black">
          <VideoCall code={code} onLeave={() => setInCall(false)} />
        </div>
      )}

      {/* Лента сообщений */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-2">
        {status === 'loading' && <p className="text-gray-400">Загрузка…</p>}

        {messages.map((m) => {
          const mine = m.user.id === currentUserId
          return (
            <div
              key={m.id}
              className={`max-w-[85%] sm:max-w-md rounded-lg px-3 py-2 ${
                mine ? 'self-end bg-blue-600 text-white' : 'self-start bg-white border border-gray-200'
              }`}
            >
              {!mine && (
                <div className="text-xs font-medium text-gray-500 mb-0.5">
                  {m.user.displayName}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
              <div className={`text-[10px] mt-0.5 text-right ${mine ? 'text-blue-200' : 'text-gray-400'}`}>
                {formatTime(m.createdAt)}
              </div>
            </div>
          )
        })}

        {/* невидимый якорь, к которому скроллим */}
        <div ref={bottomRef} />
      </main>

      {/* Поле ввода */}
      <form onSubmit={handleSend} className="flex gap-2 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white">
        <input
          type="text"
          placeholder="Сообщение…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-blue-700"
        >
          Отправить
        </button>
      </form>

      {/* Модалка создания секретки. Открывается поверх комнаты — Room и звонок НЕ
          размонтируются, поэтому LiveKit не рвётся. Клик по фону или ✕ закрывает. */}
      {showSecret && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowSecret(false)}
        >
          {/* stopPropagation — клик внутри карточки не закрывает модалку */}
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Секретная ссылка</h2>
              <button
                onClick={() => setShowSecret(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <SecretCreateForm />
          </div>
        </div>
      )}
    </div>
  )
}

export default Room
