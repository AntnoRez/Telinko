import { useCopied } from '../utils/useCopied'

// Кнопка «пригласить»: копирует ссылку (по умолчанию текущий URL) в буфер и на 2 сек
// показывает «Скопировано!». navigator.clipboard работает в защищённом контексте (https/localhost).
// props: url — что копировать; label — текст кнопки; className — стили.
function CopyLinkButton({ url, label = 'Скопировать ссылку', className = '' }) {
  const [copied, copy] = useCopied()

  return (
    <button type="button" onClick={() => copy(url ?? window.location.href)} className={className}>
      {copied ? 'Скопировано!' : label}
    </button>
  )
}

export default CopyLinkButton
