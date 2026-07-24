import { useEffect, useRef, useState } from 'react'
import SecretCreateForm from './SecretCreateForm'
import { LockIcon } from './icons'

// Иконки меню вложений (монохром, наследуют currentColor).
function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}
function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
    </svg>
  )
}
function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  )
}

// Скрепка в поле ввода чата: клик → всплывающий список (Фото/видео · Файл · Секретная ссылка).
// «Секретная ссылка» открывает форму секретки прямо тут; по созданию отдаёт готовую ссылку
// наверх (onSecretLink) — Room вставит её в поле сообщения. Фото/видео и Файл — в 7C (пока disabled).
function ChatAttachMenu({ onSecretLink, onPickFile }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('menu') // 'menu' | 'secret'
  const ref = useRef(null)
  const mediaInputRef = useRef(null) // фото/видео
  const fileInputRef = useRef(null) // любой файл

  function close() {
    setOpen(false)
    setView('menu')
  }

  // Выбрали файл в скрытом input → отдаём наверх (Room загрузит), меню закрываем.
  function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // сброс: повторный выбор того же файла тоже сработает
    if (file) {
      onPickFile?.(file)
      close()
    }
  }

  // Закрытие по клику вне.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const rowActive = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-neutral-800'

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Скрытые input'ы выбора файла (клик по пунктам меню открывает их). */}
      <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={pick} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={pick} />
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-neutral-800"
        title="Прикрепить"
        aria-label="Прикрепить"
      >
        <PaperclipIcon />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-neutral-800 bg-neutral-900 p-2 shadow-xl">
          {view === 'menu' ? (
            <div className="flex flex-col gap-0.5">
              <button type="button" onClick={() => mediaInputRef.current?.click()} className={rowActive}>
                <ImageIcon />
                <span className="flex-1">Фото/видео</span>
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className={rowActive}>
                <FileIcon />
                <span className="flex-1">Файл</span>
              </button>
              <button type="button" onClick={() => setView('secret')} className={rowActive}>
                <LockIcon className="h-[18px] w-[18px]" />
                <span className="flex-1">Секретная ссылка</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-100">Секретная ссылка</span>
                <button type="button" onClick={() => setView('menu')} className="text-xs text-gray-500 hover:text-gray-200">
                  ← назад
                </button>
              </div>
              <SecretCreateForm
                dark
                onCreated={(url) => {
                  onSecretLink(url)
                  close()
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ChatAttachMenu
