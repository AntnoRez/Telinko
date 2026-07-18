import VolumeControl from './VolumeControl'
import { useAudioMixer } from './AudioMixerContext'

// Регулятор громкости участника поверх его плитки (в углу).
// Появляется при наведении на плитку (group/tile у <ParticipantTile>).
// Свою плитку не трогаем — себя не слушаем.
function ParticipantTileControls({ participant }) {
  const { getParticipant, setParticipantVolume, toggleParticipantMute } = useAudioMixer()

  if (participant.isLocal) return null // свою громкость не крутим

  const { volume, muted } = getParticipant(participant.identity)

  return (
    // По умолчанию (тач) регулятор виден. На устройствах с наведением прячем до
    // наведения на плитку — через arbitrary-вариант [@media(hover:hover)] (остаёмся в Tailwind).
    <div className="absolute top-1 left-1 z-10 transition-opacity opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/tile:opacity-100">
      <VolumeControl
        volume={volume}
        muted={muted}
        onToggleMute={() => toggleParticipantMute(participant.identity)}
        onVolumeChange={(v) => setParticipantVolume(participant.identity, v)}
        title={muted ? 'Включить звук участника' : 'Заглушить участника'}
        popup="right"
      />
    </div>
  )
}

export default ParticipantTileControls
