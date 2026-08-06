import { useMemo, useState } from 'react'

// Монохромная иконка динамика (вкл/выкл). currentColor → наследует цвет текста (белый).
function SpeakerIcon({ muted }) {
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
      {/* корпус динамика */}
      <path d="M5 9v6h3l4 4V5L8 9H5z" fill="currentColor" stroke="none" />
      {muted ? (
        <>
          <path d="M16 10l4 4" />
          <path d="M20 10l-4 4" />
        </>
      ) : (
        <>
          <path d="M15.5 9a3.5 3.5 0 010 6" />
          <path d="M18 6.5a7 7 0 010 11" />
        </>
      )}
    </svg>
  )
}

// Регулятор громкости. Слайдер 0..200%. Чёрно-белый стиль.
// Десктоп (есть наведение): клик по кнопке = МУТ, слайдер всплывает по наведению.
// Тач (нет наведения): тап по кнопке = открыть/закрыть попап (НЕ мутит), а мут —
// отдельной кнопкой ВНУТРИ попапа (иначе на таче мут был бы недоступен вместе со слайдером).
// props:
//   volume, muted, onToggleMute, onVolumeChange, title
//   popup: 'up' | 'right' — куда всплывает слайдер
function VolumeControl({ volume, muted, onToggleMute, onVolumeChange, title, popup = 'up' }) {
  // Тач-устройство? Определяем один раз по медиа-фиче hover.
  const isTouch = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches,
    []
  )
  const [open, setOpen] = useState(false) // видимость попапа на таче

  // Позиция попапа. Начинается вплотную к кнопке (без margin), зазор — через padding,
  // чтобы область наведения была непрерывной (курсор доходит до слайдера без обрыва).
  // 'up': привязка к ЛЕВОМУ краю кнопки (раскрытие вправо), а не центрирование —
  // иначе у кнопки мастер-громкости (крайняя слева) попап половиной уходил за левый
  // край экрана на узких (мобильных) экранах.
  const popupPos =
    popup === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 pl-2'
      : 'bottom-full left-0 pb-2'

  return (
    <div className="group/vol relative flex items-center text-white">
      <button
        type="button"
        onClick={isTouch ? () => setOpen((o) => !o) : onToggleMute}
        title={isTouch ? 'Громкость' : title}
        className="lk-button flex items-center justify-center"
      >
        <SpeakerIcon muted={muted} />
      </button>

      {/* Попап: десктоп — по наведению (group-hover), тач — по тапу (open). */}
      <div
        className={`absolute z-20 transition-opacity ${popupPos} ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible'
        } group-hover/vol:opacity-100 group-hover/vol:visible`}
      >
        <div className="flex items-center gap-2 rounded bg-neutral-900/95 px-2 py-1 shadow-lg">
          {/* На таче мут живёт здесь (на десктопе мутит главная кнопка). */}
          {isTouch && (
            <button
              type="button"
              onClick={onToggleMute}
              title={muted ? 'Включить звук' : 'Заглушить'}
              className="flex items-center justify-center text-white"
            >
              <SpeakerIcon muted={muted} />
            </button>
          )}
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={volume}
            disabled={muted}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            // На таче (нет hover) слайдер шире и выше — по нему проще попасть пальцем (правка 11).
            className="w-24 accent-neutral-200 [@media(hover:none)]:h-2 [@media(hover:none)]:w-44"
          />
          <span className="w-9 text-right text-[10px] tabular-nums text-white">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export default VolumeControl
