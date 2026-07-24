import { useEffect, useRef, useState } from 'react'

// Иконки тулбара просмотрщика (монохром, наследуют currentColor).
const DownloadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
)
const RotateIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
)
const ZoomIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
)
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
)

// Полноэкранный просмотрщик картинки: затемняет фон, тулбар справа сверху (скачать / повернуть /
// зум / закрыть). Зум — колесом или кнопкой; при зуме картинку можно таскать мышью. Esc и клик по
// фону — закрыть.
function ImageLightbox({ src, name, onClose }) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null) // { startX, startY } во время перетаскивания

  // Esc закрывает.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function clampZoom(v) {
    return Math.min(5, Math.max(1, +v.toFixed(2)))
  }
  function onWheel(e) {
    e.preventDefault()
    setScale((s) => clampZoom(s + (e.deltaY < 0 ? 0.2 : -0.2)))
  }
  function toggleZoom() {
    if (scale === 1) setScale(2)
    else {
      setScale(1)
      setPos({ x: 0, y: 0 })
    }
  }
  function rotate() {
    setRotation((r) => (r + 90) % 360)
  }

  // Перетаскивание (пан) при зуме > 1.
  function onMouseDown(e) {
    if (scale === 1) return
    dragRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }
  function onMouseMove(e) {
    if (!dragRef.current) return
    setPos({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y })
  }
  function onMouseUp() {
    dragRef.current = null
  }

  // Скачивание: fetch с cookie → blob → временная ссылка. Атрибут download на кросс-origin
  // ссылке игнорируется, поэтому качаем через blob.
  async function download() {
    try {
      const res = await fetch(src, { credentials: 'include' })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name || 'image'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // не вышло — тихо
    }
  }

  const btn = 'flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85"
      onClick={onClose}
      onWheel={onWheel}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Тулбар справа сверху. stopPropagation — клик по кнопкам не закрывает просмотр. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button onClick={download} className={btn} title="Скачать"><DownloadIcon /></button>
        <button onClick={rotate} className={btn} title="Повернуть"><RotateIcon /></button>
        <button onClick={toggleZoom} className={btn} title="Увеличить (или колёсиком)"><ZoomIcon /></button>
        <button onClick={onClose} className={btn} title="Закрыть"><CloseIcon /></button>
      </div>

      <img
        src={src}
        alt={name}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={onMouseDown}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) rotate(${rotation}deg) scale(${scale})`,
          cursor: scale > 1 ? 'grab' : 'default',
        }}
        className="max-h-[90vh] max-w-[92vw] select-none"
      />
    </div>
  )
}

export default ImageLightbox
