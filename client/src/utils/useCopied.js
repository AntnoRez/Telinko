import { useState, useRef, useEffect } from 'react'

// Хук «копировать в буфер + показать галочку на N мс». Раньше этот паттерн инлайнился в
// нескольких компонентах (VideoCall, SecretView, SecretCreateForm, CopyLinkButton).
// Возвращает [copied, copy]: copy(text) кладёт text в буфер и на resetMs выставляет copied=true.
// Таймер чистится при размонтировании (в инлайн-версиях этого не было).
export function useCopied(resetMs = 2000) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text ?? '')
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
    } catch {
      // буфер недоступен (нет разрешения / не secure context) — тихо игнорируем
    }
  }

  return [copied, copy]
}
