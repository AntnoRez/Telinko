import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  DisconnectButton,
  MediaDeviceMenu,
  VideoTrack,
  ParticipantName,
  ParticipantPlaceholder,
  TrackMutedIndicator,
  ConnectionQualityIndicator,
  useTracks,
  useTrackToggle,
  useEnsureTrackRef,
  isTrackReference,
  useDataChannel,
  useLocalParticipant,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles' // дефолтные стили сетки видео и панели управления
import './videocall-overrides.css' // наши правки поверх (мгновенная рамка "говорит")
import { api } from '../api/client'
import { AudioMixerProvider, useAudioMixer } from './AudioMixerContext'
import CallAudio from './CallAudio'
import ParticipantTileControls from './ParticipantTileControls'
import VolumeControl from './VolumeControl'
import { LockIcon } from './icons'

// Стабильный на вкладку идентификатор устройства. Живёт в sessionStorage: переживает
// перезагрузку страницы, но у каждой вкладки/устройства свой. Нужен, чтобы в один
// звонок можно было зайти с РАЗНЫХ устройств (сервер клеит его в LiveKit identity —
// у каждого устройства свой identity, они сосуществуют), и при этом перезаход с ТОГО ЖЕ
// устройства не плодил «призраков», а вытеснял своего же. crypto.randomUUID доступен
// в защищённом контексте (https/localhost) — у нас и прод, и dev такие.
function getDeviceId() {
  let id = sessionStorage.getItem('lk-device-id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('lk-device-id', id)
  }
  return id
}

// Длительность звонка в «M:SS», а после часа — «H:MM:SS».
function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`
}

// Таймер длительности звонка. startedAt — ISO-строка серверного времени старта (одна на всю
// комнату → одинаково у всех и переживает F5). Тикаем раз в секунду. Пока звонок не начался
// (startedAt пуст) — ничего не рисуем. Красная точка = «звонок идёт».
function CallTimer({ startedAt }) {
  const startMs = startedAt ? new Date(startedAt).getTime() : null
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startMs) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startMs])

  if (!startMs) return null
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium tabular-nums text-white shadow">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      {formatDuration((now - startMs) / 1000)}
    </div>
  )
}

// Монохромная иконка «развернуть / свернуть» (углы наружу / внутрь).
function FullscreenIcon({ active }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {active ? (
        // свернуть — углы внутрь
        <>
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </>
      ) : (
        // развернуть — углы наружу
        <>
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </>
      )}
    </svg>
  )
}

// Плитка участника. <ParticipantTile> остаётся прямым ребёнком сетки (иначе слетают
// размеры/стили), а её содержимое отдаём детьми — воспроизводим дефолт LiveKit
// (видео/аватар/имя) и добавляем наш регулятор громкости. group/tile — чтобы регулятор
// всплывал при наведении на плитку.
function MixerTile() {
  const trackRef = useEnsureTrackRef()

  // Реальное видео есть? (у выключенной камеры трек-плейсхолдер без publication → покажем аватар)
  const isVideo =
    isTrackReference(trackRef) &&
    (trackRef.publication?.kind === 'video' ||
      trackRef.source === Track.Source.Camera ||
      trackRef.source === Track.Source.ScreenShare)

  return (
    <ParticipantTile trackRef={trackRef} className="group/tile">
      {isVideo && <VideoTrack trackRef={trackRef} />}

      {/* Аватар, когда видео нет (CSS LiveKit сам прячет его при наличии видео). */}
      <div className="lk-participant-placeholder">
        <ParticipantPlaceholder />
      </div>

      {/* Ник + индикатор выключенного микрофона + качество связи — как в шаблоне. */}
      <div className="lk-participant-metadata">
        <div className="lk-participant-metadata-item">
          <TrackMutedIndicator
            trackRef={{ participant: trackRef.participant, source: Track.Source.Microphone }}
            show="muted"
          />
          <ParticipantName />
        </div>
        <ConnectionQualityIndicator className="lk-participant-metadata-item" />
      </div>

      {/* Наш регулятор громкости этого участника. */}
      <ParticipantTileControls participant={trackRef.participant} />
    </ParticipantTile>
  )
}

// Мастер-громкость для панели — та же кнопка со всплывающим слайдером.
function MasterAudioControls() {
  const { master, setMasterVolume, toggleMasterMute } = useAudioMixer()
  return (
    <VolumeControl
      volume={master.volume}
      muted={master.muted}
      onToggleMute={toggleMasterMute}
      onVolumeChange={setMasterVolume}
      title={master.muted ? 'Включить звук всех' : 'Заглушить всех'}
      popup="up"
    />
  )
}

// Репортит родителю (Room) ЖИВОЙ список участников с состоянием мик/камеры. useTracks
// реактивен к mute/unmute/publish, поэтому состояние обновляется в реальном времени.
// Сам ничего не рендерит. identity = `${userId}__${deviceId}` → отсюда достаём userId.
function ParticipantsReporter({ onChange }) {
  const trackRefs = useTracks(
    [
      { source: Track.Source.Microphone, withPlaceholder: true },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false }
  )

  const byId = new Map()
  for (const ref of trackRefs) {
    const p = ref.participant
    if (!byId.has(p.identity)) {
      byId.set(p.identity, {
        identity: p.identity,
        userId: parseInt(p.identity.split('__')[0], 10),
        name: p.name || p.identity,
        isLocal: p.isLocal,
        micOn: false,
        camOn: false,
      })
    }
    const entry = byId.get(p.identity)
    const on = !!ref.publication && !ref.publication.isMuted // placeholder (нет трека) → off
    if (ref.source === Track.Source.Microphone) entry.micOn = on
    if (ref.source === Track.Source.Camera) entry.camOn = on
  }
  const list = [...byId.values()]
  // Сигнатура состояния — репортим наверх только при реальном изменении состава/мьютов.
  const sig = list.map((x) => `${x.identity}:${x.micOn ? 1 : 0}:${x.camOn ? 1 : 0}`).join('|')

  useEffect(() => {
    onChange(list)
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// Монохромные иконки тулбара (наследуют currentColor).
function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
// Выход из звонка (log-out: дверь + стрелка наружу).
function LeaveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
// Иконки медиа-контролов (mic/cam on/off, демонстрация экрана) — в одном стиле с остальным баром.
function MicIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-1M12 19v3" />
          <path d="M2 2l20 20" />
        </>
      ) : (
        <>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </>
      )}
    </svg>
  )
}
function CamIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <path d="M16 16H5a2 2 0 0 1-2-2V8a2 2 0 0 1 .59-1.41M10 6h4a2 2 0 0 1 2 2v2m4-4v10l-4-3" />
          <path d="M2 2l20 20" />
        </>
      ) : (
        <>
          <rect x="2" y="6" width="13" height="12" rx="2" />
          <path d="M22 8l-7 4 7 4z" />
        </>
      )}
    </svg>
  )
}
function ScreenShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M12 13V7M9 10l3-3 3 3" />
    </svg>
  )
}

// Кнопка медиа-контрола: логику берём у LiveKit (useTrackToggle → системный toggle/enabled/pending),
// а рисуем сами, чтобы всё в баре было в едином стиле. Выключено → красный (как в панели участников);
// для демонстрации экрана «включено» подсвечиваем синим (color-проп переопределяет цвет).
// Презентационная кнопка-тоггл: состояние/переключение приходят пропсами (сам хук useTrackToggle
// живёт в CallStage — так одно и то же действие переиспользуется и в баре, и в строке «···»-меню).
function ToggleButton({ enabled, pending, onToggle, icon, titleOn, titleOff, color }) {
  const tone = color ? color(enabled) : enabled ? 'text-white' : 'text-red-500'
  return (
    <button
      onClick={onToggle}
      disabled={pending}
      aria-pressed={enabled}
      className={`lk-button flex items-center justify-center ${tone} disabled:opacity-50`}
      title={enabled ? titleOn : titleOff}
    >
      {icon}
    </button>
  )
}

// Тоггл + меню ▼ выбора устройства, склеенные в единый блок через .lk-button-group (то же, что
// ControlBar делает внутри) — общее скругление и разделитель, чтобы ▼ «прилипала» к иконке.
function ToggleWithDevice({ deviceKind, ...toggleProps }) {
  return (
    <div className="lk-button-group">
      <ToggleButton {...toggleProps} />
      <div className="lk-button-group-menu">
        <MediaDeviceMenu kind={deviceKind} />
      </div>
    </div>
  )
}

// «···» — открыть меню невлезающих кнопок.
function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

// Адаптивный тулбар (как в Jitsi). Слева закреплена громкость (pinnedStart). Справа порядок:
// …адаптивные кнопки (вкл. фуллскрин) · ПОСТОЯННАЯ «⋮» · выход (leaveButton, закреплён). В «⋮» всегда
// лежат второстепенные инструменты (menuItems: пригласить, секретка, позже — доска), а СВЕРХУ туда же
// сваливаются основные кнопки (items), которые не влезли по ширине. Замер динамический: скрытая мерная
// копия даёт истинные ширины, ResizeObserver пересчитывает при ресайзе.
// items: [{ key, label, icon, onClick, node }] — node для бара, icon+label+onClick для меню.
// menuItems: [{ key, label, icon, onClick }] — всегда в «⋮».
function AdaptiveToolbar({ pinnedStart, items, menuItems, leaveButton }) {
  const wrapRef = useRef(null)
  const measureRef = useRef(null)
  const headRef = useRef(null) // закреплённая слева (громкость)
  const tailRef = useRef(null) // закреплённая справа группа (выход + ⋮ + фуллскрин)
  const menuRef = useRef(null)
  const [visibleN, setVisibleN] = useState(items.length)
  const [menuOpen, setMenuOpen] = useState(false)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const measure = measureRef.current
    if (!wrap || !measure) return
    const GAP = 6 // px, соответствует gap-1.5

    function recompute() {
      const widths = [...measure.children].map((c) => c.getBoundingClientRect().width)
      const headW = headRef.current ? headRef.current.getBoundingClientRect().width : 0
      const tailW = tailRef.current ? tailRef.current.getBoundingClientRect().width : 120
      const avail = wrap.clientWidth - headW - tailW - GAP * 2 // место под адаптивные кнопки

      // Набираем сколько влезает. «⋮» уже входит в tailW — отдельный резерв не нужен.
      let used = 0
      let n = 0
      for (let i = 0; i < widths.length; i++) {
        const add = widths[i] + (n > 0 ? GAP : 0)
        if (used + add <= avail) {
          used += add
          n++
        } else break
      }
      setVisibleN(n)
    }

    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [items.length])

  // Закрываем «⋮»-меню по клику вне него.
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const visible = items.slice(0, visibleN)
  const overflow = items.slice(visibleN)
  const menuRows = [...overflow, ...menuItems] // сверху невлезшие основные, снизу постоянные инструменты

  return (
    <div ref={wrapRef} className="videocall-toolbar relative z-20 flex shrink-0 items-center justify-center gap-1.5 py-1.5">
      {/* Скрытая мерная копия адаптивных кнопок — только для замера ширин, вне потока раскладки. */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex gap-1.5">
        {items.map((it) => (
          <div key={it.key}>{it.node}</div>
        ))}
      </div>

      {pinnedStart && <div ref={headRef}>{pinnedStart}</div>}

      {visible.map((it) => (
        <div key={it.key}>{it.node}</div>
      ))}

      {/* Закреплённая правая группа: ⋮ · выход (порядок …фуллскрин · ⋮ · выход). */}
      <div ref={tailRef} className="flex items-center gap-1.5">
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="lk-button flex items-center justify-center text-white"
            title="Ещё"
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 z-50 mb-2 flex min-w-[13rem] flex-col gap-0.5 rounded-lg border border-neutral-800 bg-neutral-900 p-1.5 shadow-xl">
              {menuRows.map((it, idx) => (
                <div key={it.key}>
                  {/* разделитель между невлезшими основными кнопками и постоянными инструментами */}
                  {idx === overflow.length && overflow.length > 0 && (
                    <div className="my-1 border-t border-neutral-800" />
                  )}
                  <button
                    onClick={() => {
                      it.onClick()
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-neutral-800"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-300">{it.icon}</span>
                    <span className="whitespace-nowrap">{it.label}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {leaveButton}
      </div>
    </div>
  )
}

// Сцена звонка: видео-сетка + наш аудио-рендер + нижний тулбар. Внутри <LiveKitRoom>.
// Тулбар — единая нижняя панель (как в Jitsi): кнопки LiveKit (mic/cam/демка/положить трубку)
// + чат/участники/пригласить/секретка/фуллскрин. Панели чата и участников рендерит родитель
// (Room), сюда приходят колбэки onToggleChat/onToggleParticipants.
function CallStage({ onToggleFullscreen, isFullscreen, unread, onToggleChat, onToggleParticipants, onOpenSecret, inviteUrl, onLiveParticipants, startedAt }) {
  // Видеотреки: камеры (с плейсхолдером, если камера выключена) + демонстрация экрана.
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])

  // Тогглы mic/cam/демки держим здесь (а не внутри кнопок) — одно действие используется и в
  // баре, и в кликабельной строке «···»-меню.
  const mic = useTrackToggle({ source: Track.Source.Microphone })
  const cam = useTrackToggle({ source: Track.Source.Camera })
  const screen = useTrackToggle({ source: Track.Source.ScreenShare })

  const [copied, setCopied] = useState(false)
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl ?? window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // буфер недоступен — тихо игнорируем
    }
  }

  // Приём просьбы «включите мик/камеру» от организатора (data-канал, топик moderation).
  // Форсить нельзя — показываем тост с кнопкой «Включить», участник решает сам.
  const { localParticipant } = useLocalParticipant()
  const [askUnmute, setAskUnmute] = useState(null) // { source } | null
  useDataChannel('moderation', (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload))
      if (data.type === 'ask-unmute') setAskUnmute({ source: data.source })
    } catch {
      // не наш формат — игнорируем
    }
  })

  // Адаптивные (основные) кнопки: node — для бара, icon+label+onClick — для строки «⋮»-меню (куда
  // они сваливаются, если не влезли). Порядок = приоритет: кто раньше — дольше остаётся видимым.
  const adaptiveItems = [
    {
      key: 'mic',
      label: mic.enabled ? 'Выключить микрофон' : 'Включить микрофон',
      icon: <MicIcon off={!mic.enabled} />,
      onClick: () => mic.toggle(),
      node: (
        <ToggleWithDevice
          deviceKind="audioinput"
          enabled={mic.enabled}
          pending={mic.pending}
          onToggle={() => mic.toggle()}
          icon={<MicIcon off={!mic.enabled} />}
          titleOn="Выключить микрофон"
          titleOff="Включить микрофон"
        />
      ),
    },
    {
      key: 'cam',
      label: cam.enabled ? 'Выключить камеру' : 'Включить камеру',
      icon: <CamIcon off={!cam.enabled} />,
      onClick: () => cam.toggle(),
      node: (
        <ToggleWithDevice
          deviceKind="videoinput"
          enabled={cam.enabled}
          pending={cam.pending}
          onToggle={() => cam.toggle()}
          icon={<CamIcon off={!cam.enabled} />}
          titleOn="Выключить камеру"
          titleOff="Включить камеру"
        />
      ),
    },
    {
      key: 'chat',
      label: 'Чат',
      icon: <ChatIcon />,
      onClick: onToggleChat,
      node: (
        <button onClick={onToggleChat} className="lk-button relative flex items-center justify-center text-white" title="Чат">
          <ChatIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      ),
    },
    {
      key: 'participants',
      label: 'Участники',
      icon: <PeopleIcon />,
      onClick: onToggleParticipants,
      node: (
        <button onClick={onToggleParticipants} className="lk-button flex items-center justify-center text-white" title="Участники">
          <PeopleIcon />
        </button>
      ),
    },
    {
      key: 'screenshare',
      label: screen.enabled ? 'Остановить показ экрана' : 'Показать экран',
      icon: <ScreenShareIcon />,
      onClick: () => screen.toggle(),
      node: (
        <ToggleButton
          enabled={screen.enabled}
          pending={screen.pending}
          onToggle={() => screen.toggle()}
          icon={<ScreenShareIcon />}
          titleOn="Остановить показ экрана"
          titleOff="Показать экран"
          color={(on) => (on ? 'text-blue-400' : 'text-white')}
        />
      ),
    },
    {
      key: 'fullscreen',
      label: isFullscreen ? 'Свернуть' : 'На весь экран',
      icon: <FullscreenIcon active={isFullscreen} />,
      onClick: onToggleFullscreen,
      node: (
        <button
          onClick={onToggleFullscreen}
          className="lk-button flex items-center justify-center text-white"
          title={isFullscreen ? 'Свернуть' : 'На весь экран'}
        >
          <FullscreenIcon active={isFullscreen} />
        </button>
      ),
    },
  ]

  // Постоянные второстепенные инструменты в «⋮» (порядок = сверху вниз).
  const menuItems = [
    {
      key: 'link',
      label: copied ? 'Скопировано!' : 'Пригласить — копировать ссылку',
      icon: copied ? <CheckIcon /> : <LinkIcon />,
      onClick: copyLink,
    },
    {
      key: 'secret',
      label: 'Секретная ссылка',
      icon: <LockIcon className="w-5 h-5" />,
      onClick: onOpenSecret,
    },
  ]

  // Выход из звонка — красная кнопка, закреплена справа (после «⋮»). Disconnect → onDisconnected → onLeave.
  const leaveButton = (
    <DisconnectButton className="lk-disconnect-button flex items-center justify-center" title="Выйти из звонка">
      <LeaveIcon />
    </DisconnectButton>
  )

  return (
    // overflow-hidden клипает горизонтальный перелив мерной копии тулбара (чтобы не было
    // скролла страницы). Всплывашки тулбара открываются ВВЕРХ, внутри этой области — не режутся.
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Таймер длительности звонка — оверлей в левом верхнем углу, поверх видео-сетки. */}
      <CallTimer startedAt={startedAt} />

      {askUnmute && (
        <div className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-neutral-900/95 px-4 py-2 text-sm text-white shadow-lg">
          <span>Организатор просит включить {askUnmute.source === 'camera' ? 'камеру' : 'микрофон'}</span>
          <button
            onClick={async () => {
              if (askUnmute.source === 'camera') await localParticipant.setCameraEnabled(true)
              else await localParticipant.setMicrophoneEnabled(true)
              setAskUnmute(null)
            }}
            className="rounded bg-blue-600 px-3 py-1 font-medium hover:bg-blue-700"
          >
            Включить
          </button>
          <button onClick={() => setAskUnmute(null)} className="text-gray-400 hover:text-white">
            Позже
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <GridLayout tracks={tracks}>
          <MixerTile />
        </GridLayout>
      </div>

      {/* Наш скрытый аудио-рендер — единственный источник звука. */}
      <CallAudio />

      {/* Репортим живой состав + состояние мик/камеры родителю (для панели участников). */}
      {onLiveParticipants && <ParticipantsReporter onChange={onLiveParticipants} />}

      {/* Единый нижний тулбар. Слева — громкость; адаптивные кнопки (вкл. фуллскрин, невлезшие уходят
          в «⋮»); затем постоянная «⋮» (пригласить/секретка/…) и закреплённый справа выход. */}
      <AdaptiveToolbar
        pinnedStart={<MasterAudioControls />}
        items={adaptiveItems}
        menuItems={menuItems}
        leaveButton={leaveButton}
      />
    </div>
  )
}

// Панель видеозвонка. Сама берёт токен у бэка и подключается к LiveKit.
// props:
//   code — комната
//   mediaPrefs { camOn, micOn } — с чем входим (из prejoin). По умолчанию мик ВКЛ, камера ВЫКЛ.
//   onLeave — выход из звонка (кнопка «положить трубку») → родитель уводит со страницы
//   unread, onToggleChat, onToggleParticipants, onOpenSecret, inviteUrl — для кнопок тулбара
//   onLiveParticipants(list) — колбэк с живым составом (identity/userId/name/isLocal/micOn/camOn)
function VideoCall({ code, mediaPrefs, startedAt, onLeave, unread, onToggleChat, onToggleParticipants, onOpenSecret, inviteUrl, onLiveParticipants }) {
  const [token, setToken] = useState(null)
  const [url, setUrl] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error

  const containerRef = useRef(null)
  const [isFs, setIsFs] = useState(false) // настоящий fullscreen (десктоп/Android)
  const [pseudoFs, setPseudoFs] = useState(false) // фолбэк «в пределах страницы» (iOS)

  // Берём пропуск: POST /api/rooms/:code/livekit-token → { token, url }.
  useEffect(() => {
    let cancelled = false

    api
      .post(`/api/rooms/${code}/livekit-token`, { deviceId: getDeviceId() })
      .then((res) => {
        if (cancelled) return
        setToken(res.data.token)
        setUrl(res.data.url)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [code])

  // Следим за настоящим fullscreen (в т.ч. выход по Esc) — чтобы иконка была верной.
  useEffect(() => {
    function onFsChange() {
      setIsFs(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    // Настоящий Fullscreen API (десктоп/Android): разворачиваем контейнер звонка.
    if (document.fullscreenEnabled && el.requestFullscreen) {
      if (document.fullscreenElement) document.exitFullscreen()
      else el.requestFullscreen()
    } else {
      // iOS и прочие без Fullscreen API для div → CSS-фолбэк «в пределах страницы».
      setPseudoFs((v) => !v)
    }
  }

  const fullscreen = isFs || pseudoFs

  if (status === 'loading') {
    return <div className="p-4 text-gray-400">Подключение к звонку…</div>
  }
  if (status === 'error') {
    return <div className="p-4 text-red-600">Не удалось подключиться к звонку</div>
  }

  return (
    // pseudoFs → fixed inset-0 накрывает весь вьюпорт поверх чата (фолбэк для iOS).
    <div
      ref={containerRef}
      data-lk-theme="default"
      className={pseudoFs ? 'fixed inset-0 z-[60] bg-black' : ''}
      style={{ height: '100%' }}
    >
      <LiveKitRoom
        serverUrl={url}
        token={token}
        connect={true}
        video={mediaPrefs?.camOn ?? false}
        audio={mediaPrefs?.micOn ?? true}
        onDisconnected={onLeave}
        // webAudioMix: микшируем звук через Web Audio (GainNode) — без этого громкость
        // выше 100% обрезалась бы HTMLAudioElement.volume. Нужен для буста 100–200%.
        options={{ webAudioMix: true }}
      >
        <AudioMixerProvider>
          <CallStage
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={fullscreen}
            startedAt={startedAt}
            unread={unread}
            onToggleChat={onToggleChat}
            onToggleParticipants={onToggleParticipants}
            onOpenSecret={onOpenSecret}
            inviteUrl={inviteUrl}
            onLiveParticipants={onLiveParticipants}
          />
        </AudioMixerProvider>
      </LiveKitRoom>
    </div>
  )
}

export default VideoCall
