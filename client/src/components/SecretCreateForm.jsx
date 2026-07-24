import { useState } from 'react'
import { api } from '../api/client'
import { encryptSecret } from '../utils/crypto'
import { WarnIcon } from './icons'

// Варианты срока жизни ссылки. seconds:null = бессрочно.
const TTL_OPTIONS = [
  { label: '5 минут', seconds: 5 * 60 },
  { label: '15 минут', seconds: 15 * 60 },
  { label: '30 минут', seconds: 30 * 60 },
  { label: '1 час', seconds: 60 * 60 },
  { label: '3 часа', seconds: 3 * 60 * 60 },
  { label: '1 день', seconds: 24 * 60 * 60 },
  { label: '1 неделя', seconds: 7 * 24 * 60 * 60 },
  { label: 'Бессрочно', seconds: null },
]

// Переиспользуемая форма создания секрета: шифрует в браузере, шлёт на сервер только
// шифроблоб, отдаёт готовую ссылку с ключом в #. Используется на странице /secret (светлая)
// и в модалке внутри звонка (тёмная). Тему переключает проп dark, чтобы не ломать /secret.
// onCreated(url) (опц.): если задан — вместо блока «ссылка готова» отдаём ссылку наверх
// (в чате вставляем её в поле сообщения) и не показываем результат внутри формы.
function SecretCreateForm({ dark = false, onCreated }) {
  const [text, setText] = useState('')
  const [ttlIndex, setTtlIndex] = useState(TTL_OPTIONS.length - 1) // дефолт «Бессрочно»
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  // Классы, зависящие от темы. Синие кнопки одинаковы в обеих темах — их не трогаем.
  const field = dark
    ? 'border border-neutral-700 bg-neutral-800 text-gray-100 placeholder-gray-500 focus:ring-blue-500'
    : 'border border-gray-300 focus:ring-blue-400'
  const labelCls = dark ? 'text-gray-300' : 'text-gray-700'
  const muted = dark ? 'text-gray-400' : 'text-gray-500'
  const noteCls = dark ? 'text-gray-300' : 'text-gray-600'
  const linkBtn = dark ? 'text-gray-400 hover:text-gray-100' : 'text-gray-500 hover:text-gray-800'
  const errCls = dark ? 'text-red-400' : 'text-red-600'

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setError(null)
    setSubmitting(true)
    try {
      // 1. Шифруем в браузере. urlKey останется у нас (уйдёт в ссылку), сервер его не увидит.
      const { urlKey, ciphertext, iv } = await encryptSecret(trimmed)

      // 2. На сервер — только шифроблоб + несекретный iv + срок. Пароля нет, всегда одноразовый.
      const res = await api.post('/api/secrets', {
        ciphertext,
        iv,
        ttlSeconds: TTL_OPTIONS[ttlIndex].seconds,
      })

      // 3. Собираем ссылку: id от сервера + ключ в #. Фрагмент (#...) на сервер не отправляется.
      const url = `${window.location.origin}/secret/${res.data.id}#${urlKey}`
      if (onCreated) onCreated(url) // чат: вернуть ссылку в поле сообщения
      else setResultUrl(url) // страница/модалка: показать блок с готовой ссылкой
    } catch {
      setError('Не удалось создать секрет')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(resultUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен (не secure context) — тихо игнорируем
    }
  }

  function handleReset() {
    setText('')
    setTtlIndex(TTL_OPTIONS.length - 1) // «Бессрочно»
    setResultUrl(null)
    setError(null)
    setCopied(false)
  }

  // --- Результат: готовая ссылка ---
  if (resultUrl) {
    return (
      <div className="flex flex-col gap-4">
        <p className={`text-sm ${noteCls}`}>
          Ссылка готова. Ключ шифрования зашит в саму ссылку (после <span className="font-mono">#</span>) —
          на сервер он не попал. Кто откроет ссылку — тот и расшифрует.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={resultUrl}
            onFocus={(e) => e.target.select()}
            className={`flex-1 min-w-0 rounded-lg px-3 py-2 font-mono text-sm ${field}`}
          />
          <button
            onClick={handleCopy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {copied ? 'Скопировано!' : 'Копировать'}
          </button>
        </div>
        <p className={`flex items-start gap-1 text-xs ${muted}`}>
          <WarnIcon className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Сгорает после первого открытия — не проверяй ссылку сам, сразу отдай получателю.</span>
        </p>
        <button
          onClick={handleReset}
          className={`self-start text-sm ${linkBtn}`}
        >
          Создать ещё
        </button>
      </div>
    )
  }

  // --- Форма ---
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Секрет: пароль, токен, приватная заметка…"
        rows={5}
        className={`rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${field}`}
      />

      <label className={`flex items-center gap-2 text-sm ${labelCls}`}>
        Срок жизни:
        <select
          value={ttlIndex}
          onChange={(e) => setTtlIndex(Number(e.target.value))}
          className={`rounded-lg px-2 py-1 ${field}`}
        >
          {TTL_OPTIONS.map((opt, i) => (
            <option key={opt.label} value={i}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {error && <p className={`text-sm ${errCls}`}>{error}</p>}

      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Шифруем…' : 'Создать ссылку'}
      </button>
    </form>
  )
}

export default SecretCreateForm
