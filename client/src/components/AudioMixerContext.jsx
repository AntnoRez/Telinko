import { createContext, useContext, useState, useCallback } from 'react'

// Состояние локального аудио-микшера звонка: общий уровень (мастер) + по каждому
// участнику. Всё ЛОКАЛЬНО — влияет только на то, как звук слышит текущий юзер.
// Громкость хранится как доля: 1 = 100%, 2 = 200% (буст). Диапазон слайдеров 0..2.

const AudioMixerContext = createContext(null)

// Дефолт для участника, о котором ещё ничего не настраивали.
const DEFAULT = { volume: 1, muted: false }

export function AudioMixerProvider({ children }) {
  const [master, setMaster] = useState({ volume: 1, muted: false })
  const [perId, setPerId] = useState({}) // { [identity]: { volume, muted } }

  const setMasterVolume = useCallback((volume) => {
    setMaster((m) => ({ ...m, volume }))
  }, [])

  const toggleMasterMute = useCallback(() => {
    setMaster((m) => ({ ...m, muted: !m.muted }))
  }, [])

  // Настройки конкретного участника (с дефолтами, если ещё не трогали).
  const getParticipant = useCallback(
    (identity) => perId[identity] ?? DEFAULT,
    [perId]
  )

  const setParticipantVolume = useCallback((identity, volume) => {
    setPerId((p) => ({
      ...p,
      [identity]: { volume, muted: p[identity]?.muted ?? false },
    }))
  }, [])

  const toggleParticipantMute = useCallback((identity) => {
    setPerId((p) => ({
      ...p,
      [identity]: { volume: p[identity]?.volume ?? 1, muted: !(p[identity]?.muted ?? false) },
    }))
  }, [])

  // Итоговые значения для аудио-рендера: перемножаем мастер и личное.
  // Мут мастера ИЛИ личный мут → тишина. Иначе громкости перемножаются.
  const effective = useCallback(
    (identity) => {
      const p = perId[identity] ?? DEFAULT
      return {
        muted: master.muted || p.muted,
        volume: master.volume * p.volume,
      }
    },
    [master, perId]
  )

  const value = {
    master,
    setMasterVolume,
    toggleMasterMute,
    getParticipant,
    setParticipantVolume,
    toggleParticipantMute,
    effective,
  }

  return <AudioMixerContext.Provider value={value}>{children}</AudioMixerContext.Provider>
}

// Хук доступа к микшеру. Кидает ошибку, если вызван вне провайдера.
export function useAudioMixer() {
  const ctx = useContext(AudioMixerContext)
  if (!ctx) throw new Error('useAudioMixer должен вызываться внутри <AudioMixerProvider>')
  return ctx
}
