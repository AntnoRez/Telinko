import { useEffect, useRef, useState } from 'react'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  ControlBar,
  VideoTrack,
  ParticipantName,
  ParticipantPlaceholder,
  TrackMutedIndicator,
  ConnectionQualityIndicator,
  useTracks,
  useEnsureTrackRef,
  isTrackReference,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles' // дефолтные стили сетки видео и панели управления
import './videocall-overrides.css' // наши правки поверх (мгновенная рамка "говорит")
import { api } from '../api/client'
import { AudioMixerProvider, useAudioMixer } from './AudioMixerContext'
import CallAudio from './CallAudio'
import ParticipantTileControls from './ParticipantTileControls'
import VolumeControl from './VolumeControl'

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

// Сцена звонка: видео-сетка + наш аудио-рендер + панель. Внутри <LiveKitRoom>.
function CallStage({ onToggleFullscreen, isFullscreen }) {
  // Видеотреки: камеры (с плейсхолдером, если камера выключена) + демонстрация экрана.
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <GridLayout tracks={tracks}>
          <MixerTile />
        </GridLayout>
      </div>

      {/* Наш скрытый аудио-рендер — единственный источник звука. */}
      <CallAudio />

      {/* Панель: мастер-громкость + кнопки LiveKit (без чата) + fullscreen.
          flex-wrap — на узком экране элементы переносятся, а не сжимаются в кашу. */}
      <div className="flex flex-wrap items-center justify-center gap-1 py-1">
        <MasterAudioControls />
        <ControlBar variation="minimal" controls={{ chat: false }} />
        <button
          onClick={onToggleFullscreen}
          className="lk-button flex items-center justify-center text-white"
          title={isFullscreen ? 'Свернуть' : 'На весь экран'}
        >
          <FullscreenIcon active={isFullscreen} />
        </button>
      </div>
    </div>
  )
}

// Панель видеозвонка. Сама берёт токен у бэка и подключается к LiveKit.
// props: code (комната), onLeave (выход из звонка → родитель убирает панель)
function VideoCall({ code, onLeave }) {
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
      .post(`/api/rooms/${code}/livekit-token`)
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
        video={true}
        audio={true}
        onDisconnected={onLeave}
        // webAudioMix: микшируем звук через Web Audio (GainNode) — без этого громкость
        // выше 100% обрезалась бы HTMLAudioElement.volume. Нужен для буста 100–200%.
        options={{ webAudioMix: true }}
      >
        <AudioMixerProvider>
          <CallStage onToggleFullscreen={toggleFullscreen} isFullscreen={fullscreen} />
        </AudioMixerProvider>
      </LiveKitRoom>
    </div>
  )
}

export default VideoCall
