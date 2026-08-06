import { useEffect, useRef, useState } from 'react'
import { FullscreenIcon, DownloadIcon, CheckIcon } from './icons'

// --- Иконки контролов (fill для play/pause, stroke для остального). ---
const PlayIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
)
const PauseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
)
const VolumeIcon = ({ muted }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
    {muted ? (
      <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
    ) : (
      <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>
    )}
  </svg>
)
const MoreIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
)

const SPEEDS = [0.5, 1, 1.5, 2]

function fmt(t) {
  if (!isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Свой видеоплеер: контролы поверх <video> без нативного controls (их не перекрасить/переставить).
// Полный экран — отдельной кнопкой (не в «⋮»); «⋮» справа сверху с тёмным меню (Скачать + Скорость).
// Адаптив: на десктопе контролы по наведению и авто-скрытие; на тач-устройствах — по тапу.
function VideoPlayer({ src, name }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const menuRef = useRef(null)
  const hideTimer = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)
  const [controls, setControls] = useState(true)
  const [fs, setFs] = useState(false)

  // Следим за настоящим fullscreen (в т.ч. выход по Esc), чтобы иконка была верной.
  useEffect(() => {
    const onFs = () => setFs(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // Закрытие «⋮»-меню по клику вне.
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  // При размонтировании гасим таймер авто-скрытия контролов — иначе setControls сработает уже
  // после unmount (VP1). hideTimer живёт в ref, поэтому чистим один раз на выходе.
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  // Показать контролы и (если играет) спрятать через 2.5с бездействия.
  function poke() {
    setControls(true)
    clearTimeout(hideTimer.current)
    if (playing) hideTimer.current = setTimeout(() => setControls(false), 2500)
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }
  function toggleMute() {
    const v = videoRef.current
    v.muted = !v.muted
  }
  function onSeek(e) {
    videoRef.current.currentTime = Number(e.target.value)
  }
  function setPlaybackSpeed(s) {
    videoRef.current.playbackRate = s
    setSpeed(s)
    setMenuOpen(false)
  }
  function toggleFullscreen() {
    const el = containerRef.current
    const v = videoRef.current
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else if (el?.requestFullscreen) {
      el.requestFullscreen()
    } else if (v?.webkitEnterFullscreen) {
      v.webkitEnterFullscreen() // iOS: только нативный фулскрин самого <video>
    }
  }
  async function download() {
    setMenuOpen(false)
    try {
      const res = await fetch(src, { credentials: 'include' })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name || 'video'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // тихо
    }
  }

  const iconBtn = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-white hover:bg-white/15'

  return (
    <div
      ref={containerRef}
      className={`group relative overflow-hidden rounded-lg bg-black ${fs ? 'flex h-full w-full items-center justify-center' : 'max-w-full'}`}
      onMouseMove={poke}
      onMouseLeave={() => playing && setControls(false)}
      onTouchStart={poke}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true)
          poke()
        }}
        onPause={() => {
          setPlaying(false)
          setControls(true)
          clearTimeout(hideTimer.current)
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted)
          setVolume(e.currentTarget.volume)
        }}
        onEnded={() => setPlaying(false)}
        className={fs ? 'max-h-full max-w-full' : 'max-h-72 max-w-full'}
      />

      {/* Крупная play по центру, когда на паузе (визуал; клик ловит video). */}
      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white">
            <PlayIcon />
          </span>
        </div>
      )}

      {/* «⋮» справа сверху + тёмное меню (Скачать / Скорость). */}
      <div ref={menuRef} className={`absolute right-2 top-2 z-20 transition-opacity ${controls ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 text-white hover:bg-black/60"
          title="Ещё"
        >
          <MoreIcon />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-neutral-800 bg-neutral-900 p-1 shadow-xl">
            <button onClick={download} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-gray-200 hover:bg-neutral-800">
              <DownloadIcon size={18} />
              Скачать
            </button>
            <div className="my-1 border-t border-neutral-800" />
            <div className="px-3 py-1 text-[11px] text-gray-500">Скорость</div>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className="flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-neutral-800"
              >
                <span>{s}×</span>
                {speed === s && <CheckIcon size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Нижняя панель контролов — компактная, прижата к низу. Звук — просто вкл/выкл (без слайдера). */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-2 pb-0.5 pt-4 transition-opacity ${
          controls ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <input
          type="range"
          min={0}
          max={duration || 0}
          step="0.1"
          value={current}
          onChange={onSeek}
          className="mb-0.5 block w-full accent-indigo-500"
          aria-label="Перемотка"
        />
        <div className="flex items-center gap-0.5 text-white">
          <button onClick={togglePlay} className={iconBtn} title={playing ? 'Пауза' : 'Играть'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={toggleMute} className={iconBtn} title={muted ? 'Включить звук' : 'Без звука'}>
            <VolumeIcon muted={muted || volume === 0} />
          </button>
          <span className="ml-1 shrink-0 whitespace-nowrap text-xs tabular-nums">
            {fmt(current)} / {fmt(duration)}
          </span>
          <div className="flex-1" />
          <button onClick={toggleFullscreen} className={iconBtn} title={fs ? 'Свернуть' : 'На весь экран'}>
            <FullscreenIcon active={fs} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default VideoPlayer
