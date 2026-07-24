import { useState } from 'react'

// Кнопка «пригласить»: копирует ссылку (по умолчанию текущий URL) в буфер и на 2 сек
// показывает «Скопировано!». navigator.clipboard работает в защищённом контексте (https/localhost).
// props: url — что копировать; label — текст кнопки; className — стили.
function CopyLinkButton({ url, label = 'Скопировать ссылку', className = '' }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url ?? window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен (нет разрешения / не защищённый контекст) — тихо игнорируем
    }
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? 'Скопировано!' : label}
    </button>
  )
}

export default CopyLinkButton
