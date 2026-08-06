import { useEffect, useRef, useState } from 'react'

// Иконка-смайлик (контур, как в референсе).
function SmileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}

// Набор основных эмодзи для чата (без категорий — просто популярные).
const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎',
  '🤩', '🥳', '😉', '🙂', '🙃', '😇', '😜', '🤔',
  '🤨', '😐', '😴', '😌', '😢', '😭', '😤', '😡',
  '🥺', '😱', '😳', '🤯', '😬', '🙄', '🤗', '🤫',
  '👍', '👎', '👌', '✌️', '🤞', '🙏', '👏', '🙌',
  '💪', '👀', '🔥', '⭐', '✨', '🎉', '🎊', '💯',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔',
  '😅', '🤪', '🥰', '😏', '🤤', '🥶', '🤝', '👋',
]

// Пикер эмодзи: кнопка-смайлик + всплывающая сетка. Клик по эмодзи → onPick(emoji) (родитель
// вставит его в поле). Пикер НЕ закрывается после выбора — можно накидать несколько; закрытие
// по клику вне.
function EmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-neutral-700 hover:text-gray-100"
        title="Эмодзи"
        aria-label="Эмодзи"
      >
        <SmileIcon />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-800 bg-neutral-900 p-2 shadow-xl">
          <div className="dark-scroll grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto overflow-x-hidden">
            {EMOJIS.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPick(e)}
                className="flex h-8 w-8 items-center justify-center rounded text-xl leading-none hover:bg-neutral-800"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default EmojiPicker
