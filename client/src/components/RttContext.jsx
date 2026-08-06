import { createContext, useContext, useEffect, useState } from 'react'
import { useDataChannel, useRoomContext } from '@livekit/components-react'

// «Пинг собеседника» в SFU (как E2E RTT в Jitsi). Прямого соединения между участниками нет —
// все идут через сервер LiveKit. Поэтому сквозной пинг оцениваем суммой двух плеч через сервер:
//   E2E(до собеседника) ≈ (мой RTT до сервера) + (его RTT до сервера).
// Свой RTT до сервера каждый знает из getStats (candidate-pair). Чужой — узнаём так же, как Jitsi:
// каждый клиент раз в ~3с рассылает свой RTT остальным по data-каналу (топик 'rtt'), а мы храним
// присланные значения. ConnectionInfo складывает их с нашим и показывает пинг до конкретного пира.

const RttContext = createContext(null)
export const useRtt = () => useContext(RttContext)

// Свой RTT до сервера (мс) из candidate-pair. RTT общий на PeerConnection, поэтому годится любой
// наш трек: сперва свои опубликованные (publisher PC), если публикуем; иначе любой подписанный
// чужой (subscriber PC) — плечо до сервера то же самое.
async function measureMyRttMs(room) {
  const tracks = []
  for (const pub of room.localParticipant.trackPublications.values()) {
    if (pub.track) tracks.push(pub.track)
  }
  if (!tracks.length) {
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.track) { tracks.push(pub.track); break }
      }
      if (tracks.length) break
    }
  }
  for (const track of tracks) {
    if (!track.getRTCStatsReport) continue
    let report
    try {
      report = await track.getRTCStatsReport()
    } catch {
      continue
    }
    if (!report) continue
    let rtt = null
    report.forEach((r) => {
      if (
        r.type === 'candidate-pair' &&
        r.currentRoundTripTime != null &&
        (r.nominated || r.state === 'succeeded')
      ) {
        rtt = r.currentRoundTripTime
      }
    })
    if (rtt != null) return Math.round(rtt * 1000)
  }
  return null
}

// Один на клиента (живёт в CallStage). Рассылает свой RTT и собирает чужие.
export function RttProvider({ children }) {
  const room = useRoomContext()
  const [myRtt, setMyRtt] = useState(null)
  const [peerRtts, setPeerRtts] = useState({}) // identity -> { rtt, ts }

  // Приём чужих RTT: складываем по identity отправителя с временной меткой (для протухания).
  // Значение приходит от другого клиента — валидируем: конечное неотрицательное число в разумных
  // пределах (< 100 с). Так отсекаем битый/злонамеренный payload (NaN, Infinity, мусор).
  const { send } = useDataChannel('rtt', (msg) => {
    const from = msg.from?.identity
    if (!from) return
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload))
      if (Number.isFinite(data.rtt) && data.rtt >= 0 && data.rtt < 100000) {
        setPeerRtts((prev) => ({ ...prev, [from]: { rtt: data.rtt, ts: Date.now() } }))
      }
    } catch {
      // не наш формат — игнорируем
    }
  })

  // Периодически меряем свой RTT до сервера и рассылаем. Ненадёжная доставка (reliable:false) —
  // значение эфемерное, потерю следующий тик закроет.
  useEffect(() => {
    let cancelled = false
    async function tick() {
      const rtt = await measureMyRttMs(room)
      if (cancelled || rtt == null) return
      setMyRtt(rtt)
      try {
        await send(new TextEncoder().encode(JSON.stringify({ rtt })), { reliable: false })
      } catch {
        // канал мог быть не готов — не страшно, повторим на следующем тике
      }
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [room, send])

  return (
    <RttContext.Provider value={{ myId: room.localParticipant.identity, myRtt, peerRtts }}>
      {children}
    </RttContext.Provider>
  )
}
