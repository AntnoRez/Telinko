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
    setMaster((m) => {
      // 0% трактуем как мут: клик по «размуту» на нулевой громкости возвращает звук на 100%.
      if (m.muted || m.volume === 0) return { muted: false, volume: m.volume === 0 ? 1 : m.volume }
      return { ...m, muted: true }
    })
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
    setPerId((p) => {
      const cur = p[identity] ?? DEFAULT
      // 0% = мут: размут на нулевой громкости возвращает звук на 100%.
      const next =
        cur.muted || cur.volume === 0
          ? { muted: false, volume: cur.volume === 0 ? 1 : cur.volume }
          : { ...cur, muted: true }
      return { ...p, [identity]: next }
    })
  }, [])

  // Итоговые значения для аудио-рендера: перемножаем мастер и личное.
  // Мут мастера/личный ИЛИ нулевая итоговая громкость → тишина (0% = мут). Иначе перемножаем.
  const effective = useCallback(
    (identity) => {
      const p = perId[identity] ?? DEFAULT
      const volume = master.volume * p.volume
      return {
        muted: master.muted || p.muted || volume === 0,
        volume,
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
