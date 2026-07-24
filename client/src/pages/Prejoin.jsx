import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { roomDisplayName } from '../utils/room'
import CopyLinkButton from '../components/CopyLinkButton'

// Иконки микрофона/камеры (вкл/выкл). currentColor наследует цвет кнопки.
function MicIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

function CamIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h11v10H3z" fill="currentColor" stroke="none" />
      <path d="M14 10l6-3v10l-6-3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

// Экран ПЕРЕД входом в комнату (как в Jitsi): превью камеры + имя + тумблеры мик/камера.
// Кнопки «Я организатор» здесь НЕТ — она на экране ожидания (внутри Room, после входа).
// props:
//   code   — код комнаты (из него показываем читаемое имя)
//   inviteUrl — ссылка на комнату для приглашения (есть только когда комната уже существует,
//               т.е. при ВХОДЕ; при СОЗДАНИИ комнаты ещё нет → не передаём, кнопки нет)
//   onJoin({ camOn, micOn }) — вызываем, когда личность готова (гость заведён / уже вошли)
//   onExit (опц.) — «Выйти» с экрана prejoin (назад на Home / из комнаты). Нет пропа → кнопки нет.
function Prejoin({ code, inviteUrl, onJoin, onExit }) {
  const user = useAuthStore((s) => s.user)
  const guest = useAuthStore((s) => s.guest)

  const [name, setName] = useState(user?.displayName ?? '')
  const [camOn, setCamOn] = useState(false) // камера по умолчанию ВЫКЛ
  const [micOn, setMicOn] = useState(true) // микрофон по умолчанию ВКЛ
  const [stream, setStream] = useState(null) // видео-поток превью (только когда камера вкл)
  const [mediaError, setMediaError] = useState(null)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(null)

  const videoRef = useRef(null)

  // Превью держим ТОЛЬКО когда камера включена. Микрофон в превью не показываем — его
  // состояние это просто настройка, которую унесём в звонок. Камера выкл → гасим поток.
  useEffect(() => {
    if (!camOn) {
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop())
        return null
      })
      setMediaError(null)
      return
    }

    let cancelled = false
    let acquired = null
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop()) // успели выключить/уйти — не оставляем висеть
          return
        }
        acquired = s
        setStream(s)
        setMediaError(null)
      })
      .catch(() => {
        if (!cancelled) {
          setMediaError('Нет доступа к камере — можно войти без видео')
          setCamOn(false)
        }
      })

    // cleanup: срабатывает при выключении камеры И при размонтировании — гасим поток.
    return () => {
      cancelled = true
      acquired?.getTracks().forEach((t) => t.stop())
    }
  }, [camOn])

  // Прицепляем поток к <video>, когда он появился (video рендерится только при camOn).
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null
  }, [stream])

  const trimmed = name.trim()
  const canJoin = trimmed.length > 0 && !joining

  async function handleJoin() {
    if (!canJoin) return
    setError(null)
    setJoining(true)
    try {
      // Не авторизован → заводим гостя по имени. Уже авторизован (аккаунт/гость) → входим собой.
      if (!user) await guest(trimmed)
      // Гасим превью — в звонок LiveKit заведёт свой поток заново.
      stream?.getTracks().forEach((t) => t.stop())
      onJoin({ camOn, micOn })
    } catch {
      setError('Не удалось войти. Попробуй ещё раз.')
      setJoining(false)
    }
  }

  const displayName = roomDisplayName(code)
  const initial = (trimmed || '?').charAt(0).toUpperCase()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-900 text-white px-4">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold">Присоединиться к встрече</h1>
        <p className="mt-1 text-gray-400 truncate max-w-xs sm:max-w-md">{displayName}</p>
      </div>

      {/* Превью: видео, когда камера вкл; иначе — аватар с первой буквой имени (как в Jitsi). */}
      <div className="relative w-full max-w-md aspect-video rounded-xl bg-black overflow-hidden flex items-center justify-center">
        {camOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }} // зеркалим — как в зеркале, привычнее
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pink-600 text-3xl font-semibold">
            {initial}
          </div>
        )}

        {/* Тумблеры мик/камера поверх превью снизу. */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3">
          <button
            type="button"
            onClick={() => setMicOn((v) => !v)}
            title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              micOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            <MicIcon off={!micOn} />
          </button>
          <button
            type="button"
            onClick={() => setCamOn((v) => !v)}
            title={camOn ? 'Выключить камеру' : 'Включить камеру'}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              camOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            <CamIcon off={!camOn} />
          </button>
        </div>
      </div>

      {mediaError && <p className="text-amber-400 text-sm">{mediaError}</p>}

      {/* Имя + вход. Кнопка активна, когда имя не пустое. Enter — тоже вход. */}
      <div className="w-full max-w-md flex flex-col gap-3">
        <input
          type="text"
          placeholder="Пожалуйста, введите своё имя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          maxLength={50}
          className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleJoin}
          disabled={!canJoin}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {joining ? 'Входим…' : 'Присоединиться к встрече'}
        </button>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Пригласить — только когда комната уже есть (при входе). При создании ссылки ещё нет. */}
        {inviteUrl && (
          <CopyLinkButton
            url={inviteUrl}
            label="Пригласить — копировать ссылку"
            className="mt-1 self-center text-sm text-gray-400 hover:text-white underline underline-offset-2"
          />
        )}

        {/* Выйти — как в комнате ожидания (назад на Home / из комнаты, поведение задаёт родитель). */}
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="mt-1 self-center text-sm text-gray-500 hover:text-gray-300"
          >
            Выйти
          </button>
        )}
      </div>
    </div>
  )
}

export default Prejoin
