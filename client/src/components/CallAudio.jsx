import { useTracks, AudioTrack } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useAudioMixer } from './AudioMixerContext'

// Наш аудио-рендер — замена RoomAudioRenderer из префаба <VideoConference>.
// Рисует по одному СКРЫТОМУ <AudioTrack> на каждый ЧУЖОЙ аудиотрек (микрофон + звук
// шаринга экрана), с громкостью и мутом из микшера. Себя не воспроизводим — иначе эхо.
function CallAudio() {
  const { effective } = useAudioMixer()

  // Все аудиотреки комнаты: микрофоны + звук демонстрации экрана. Локального убираем.
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio]).filter(
    (ref) => !ref.participant.isLocal // Убираем свой звук
  )


  return (
    // display:none — сам звук играет, но визуально этих <audio> не видно.
    <div style={{ display: 'none' }}>
      {tracks.map((ref) => {
        // Итоговые громкость/мут для владельца трека (мастер × личное).
        const { volume, muted } = effective(ref.participant.identity)
        return (
          <AudioTrack
            key={ref.publication.trackSid}
            trackRef={ref}
            volume={volume}
            muted={muted}
          />
        )
      })}
    </div>
  )
}

export default CallAudio
