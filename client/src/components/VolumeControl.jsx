import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
// Попап рендерится ПОРТАЛОМ (fixed по координатам кнопки), а не внутри плитки — иначе на мелких
// плитках он обрезался бы их краями (overflow:hidden для скругления видео).
// props:
//   volume, muted, onToggleMute, onVolumeChange, title
//   popup: 'up' | 'right' — куда всплывает слайдер относительно кнопки
function VolumeControl({ volume, muted, onToggleMute, onVolumeChange, title, popup = 'up' }) {
  // Тач-устройство? Определяем один раз по медиа-фиче hover.
  const isTouch = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches,
    []
  )
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null) // { left, top, ty } — fixed-координаты попапа
  const [target, setTarget] = useState(null) // куда портируем (fullscreen-элемент или body)
  const btnRef = useRef(null)
  const popupRef = useRef(null)
  const closeTimer = useRef(null)

  // 0% трактуем как мут: иконка/подпись показывают «выключено», даже если флаг muted ещё false
  // (сам мут-переключатель живёт в контексте — он же поднимет громкость при размуте с нуля).
  const effMuted = muted || volume === 0

  function openPopup() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    // В нативном фуллскрине body-портал не виден (показывается только fullscreen-поддерево) →
    // портируем в fullscreenElement, иначе в body. Позиция fixed по кнопке → не режется плиткой.
    setTarget(document.fullscreenElement || document.body)
    // Прикидка ширины попапа (иконки + слайдер + %) — для клампа/флипа, чтобы не вылезал за экран.
    const PW = isTouch ? 280 : 200
    const vw = window.innerWidth
    if (popup === 'right') {
      // Справа от кнопки; если не влезает (правый участник у края) — флип влево от кнопки.
      let left = r.right + 8
      if (left + PW > vw - 8) left = r.left - PW - 8
      left = Math.max(8, Math.min(left, vw - PW - 8))
      setPos({ left, top: r.top + r.height / 2, ty: '-50%' })
    } else {
      // Над кнопкой; кламп по горизонтали, если кнопка близко к краю экрана.
      const left = Math.max(8, Math.min(r.left, vw - PW - 8))
      setPos({ left, top: r.top - 8, ty: '-100%' })
    }
    clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const scheduleClose = () => { closeTimer.current = setTimeout(() => setOpen(false), 140) }
  const cancelClose = () => clearTimeout(closeTimer.current)

  // Снять висящий таймер при размонтировании.
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Скролл/ресайз отвязали бы fixed-попап от кнопки → просто закрываем.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // Тач: закрытие по тапу вне кнопки и попапа.
  useEffect(() => {
    if (!open || !isTouch) return
    const onDoc = (e) => {
      if (!btnRef.current?.contains(e.target) && !popupRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, isTouch])

  // Кнопка: тач — тап открывает/закрывает попап; десктоп — клик мутит, наведение открывает попап.
  const btnHandlers = isTouch
    ? { onClick: () => (open ? setOpen(false) : openPopup()) }
    : { onClick: onToggleMute, onMouseEnter: openPopup, onMouseLeave: scheduleClose }

  return (
    <div className="flex items-center text-white">
      <button
        ref={btnRef}
        type="button"
        {...btnHandlers}
        title={isTouch ? 'Громкость' : title}
        className="lk-button flex items-center justify-center"
      >
        <SpeakerIcon muted={effMuted} />
      </button>

      {open && pos && target &&
        createPortal(
          <div
            ref={popupRef}
            style={{ position: 'fixed', left: pos.left, top: pos.top, transform: `translateY(${pos.ty})` }}
            onMouseEnter={!isTouch ? cancelClose : undefined}
            onMouseLeave={!isTouch ? scheduleClose : undefined}
            className="z-[70] flex items-center gap-2 rounded bg-neutral-900/95 px-2 py-1.5 shadow-lg"
          >
            {/* На таче мут живёт здесь (на десктопе мутит главная кнопка). */}
            {isTouch && (
              <button
                type="button"
                onClick={onToggleMute}
                title={effMuted ? 'Включить звук' : 'Заглушить'}
                className="flex items-center justify-center text-white"
              >
                <SpeakerIcon muted={effMuted} />
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
              // На таче слайдер шире и выше — проще попасть пальцем (правка 11).
              className="w-28 accent-neutral-200 [@media(hover:none)]:h-2 [@media(hover:none)]:w-44"
            />
            <span className="w-9 text-right text-[10px] tabular-nums text-white">
              {Math.round(volume * 100)}%
            </span>
          </div>,
          target
        )}
    </div>
  )
}

export default VolumeControl
