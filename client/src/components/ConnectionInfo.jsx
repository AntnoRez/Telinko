import { useEffect, useMemo, useRef, useState } from 'react'
import { useConnectionQualityIndicator } from '@livekit/components-react'
import { useRtt } from './RttContext'

// Качество связи → подпись, цвет, число «горящих» палочек. Значения — из ConnectionQuality
// (livekit-client): excellent/good/poor/lost/unknown.
const QUALITY = {
  excellent: { label: 'Отличная', tone: 'text-green-400', bars: 3 },
  good: { label: 'Хорошая', tone: 'text-green-400', bars: 2 },
  poor: { label: 'Плохая', tone: 'text-yellow-400', bars: 1 },
  lost: { label: 'Потеряна', tone: 'text-red-500', bars: 0 },
  unknown: { label: '—', tone: 'text-gray-400', bars: 0 },
}

// Три палочки индикатора: первые `bars` горят текущим цветом, остальные приглушены.
function Bars({ bars }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i <= bars ? 'bg-current' : 'bg-current opacity-30'}`}
          style={{ height: `${i * 4 + 2}px` }}
        />
      ))}
    </span>
  )
}

// Индикатор качества связи с попапом-деталями (правка 3): качество + пинг + битрейт ↓↑.
// Битрейт — из WebRTC getStats по трекам участника, поллинг раз в 2с и ТОЛЬКО пока попап открыт
// (иначе жрал бы CPU на каждой плитке). Пинг — из RttContext: своя плитка → мой RTT до сервера;
// чужая → E2E ≈ мой RTT + RTT собеседника (тот присылает его по data-каналу, как E2E RTT в Jitsi).
// Десктоп — по наведению, тач — по тапу. Значащий поток: у чужого входящий (↓), у себя (↑).
function ConnectionInfo({ participant }) {
  const { quality } = useConnectionQualityIndicator({ participant })
  const q = QUALITY[quality] || QUALITY.unknown

  const rtt = useRtt()
  // Пинг до этого участника. Свой — мой RTT до сервера; чужой — сумма плеч через сервер, если
  // его свежий RTT дошёл (не старше 8с). Нет данных → null (покажем «—»).
  let pingMs = null
  if (rtt) {
    if (participant.identity === rtt.myId) {
      pingMs = rtt.myRtt
    } else {
      const peer = rtt.peerRtts[participant.identity]
      if (peer && rtt.myRtt != null && Date.now() - peer.ts < 8000) pingMs = rtt.myRtt + peer.rtt
    }
  }

  const [open, setOpen] = useState(false)
  const [stats, setStats] = useState(null) // { down, up } | null — битрейт
  const prevRef = useRef(null) // предыдущий замер байт+времени — для дельты битрейта
  const closeTimer = useRef(null) // debounce закрытия при переходе курсора кнопка→попап
  const rootRef = useRef(null)

  const isTouch = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches,
    []
  )

  // Тач: закрытие по тапу вне.
  useEffect(() => {
    if (!open || !isTouch) return
    const onDoc = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, isTouch])

  // Снять висящий debounce-таймер закрытия при размонтировании (плитка исчезла — участник вышел),
  // иначе setOpen сработал бы на размонтированном компоненте.
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Поллинг статистики — только пока попап открыт.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function sample() {
      let bytesRecv = 0
      let bytesSent = 0
      for (const pub of participant.trackPublications.values()) {
        const track = pub.track
        if (!track?.getRTCStatsReport) continue
        let report
        try {
          report = await track.getRTCStatsReport()
        } catch {
          continue
        }
        if (!report) continue
        report.forEach((r) => {
          if (r.type === 'inbound-rtp') bytesRecv += r.bytesReceived || 0
          else if (r.type === 'outbound-rtp') bytesSent += r.bytesSent || 0
        })
      }
      if (cancelled) return

      // Битрейт — дельта байт с прошлого замера, в кбит/с. Первый замер эталонный (без битрейта).
      const now = Date.now()
      const prev = prevRef.current
      let down = null
      let up = null
      if (prev && now > prev.ts) {
        const dt = (now - prev.ts) / 1000
        down = Math.max(0, Math.round(((bytesRecv - prev.bytesRecv) * 8) / dt / 1000))
        up = Math.max(0, Math.round(((bytesSent - prev.bytesSent) * 8) / dt / 1000))
      }
      prevRef.current = { ts: now, bytesRecv, bytesSent }
      setStats({ down, up })
    }

    sample()
    const id = setInterval(sample, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
      prevRef.current = null
      setStats(null)
    }
  }, [open, participant])

  // Десктоп: наведение открывает, уход закрывает с debounce (чтобы перейти кнопка→попап без мигания).
  const hoverProps = isTouch
    ? {}
    : {
        onMouseEnter: () => {
          clearTimeout(closeTimer.current)
          setOpen(true)
        },
        onMouseLeave: () => {
          closeTimer.current = setTimeout(() => setOpen(false), 120)
        },
      }

  return (
    <div ref={rootRef} className={`relative flex items-center ${q.tone}`} {...hoverProps}>
      <button
        type="button"
        onClick={isTouch ? () => setOpen((o) => !o) : undefined}
        className="flex items-center"
        title="Связь"
        aria-label={`Связь: ${q.label}`}
      >
        <Bars bars={q.bars} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-1 w-max rounded-lg bg-neutral-900/95 px-3 py-2 text-[11px] leading-relaxed text-gray-200 shadow-lg">
          <div className="mb-0.5 flex items-center gap-1.5 font-medium">
            <span className={`h-2 w-2 rounded-full bg-current ${q.tone}`} />
            <span className="text-gray-100">Связь: {q.label}</span>
          </div>
          <div className="text-gray-300">
            Пинг: {pingMs != null ? `${pingMs} мс` : '—'}
          </div>
          <div className="text-gray-300">
            ↓ {stats?.down != null ? stats.down : '—'} · ↑ {stats?.up != null ? stats.up : '—'} кбит/с
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionInfo
