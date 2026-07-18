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
// шифроблоб, отдаёт готовую ссылку с ключом в #. Используется на странице /secret и
// в модалке внутри звонка.
function SecretCreateForm() {
  const [text, setText] = useState('')
  const [password, setPassword] = useState('')
  const [burnAfterRead, setBurnAfterRead] = useState(true)
  const [ttlIndex, setTtlIndex] = useState(3) // дефолт «1 час»
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setError(null)
    setSubmitting(true)
    try {
      // 1. Шифруем в браузере. urlKey останется у нас (уйдёт в ссылку), сервер его не увидит.
      const { urlKey, ciphertext, iv, salt } = await encryptSecret(trimmed, password)

      // 2. На сервер — только шифроблоб + несекретные iv/salt + настройки.
      const res = await api.post('/api/secrets', {
        ciphertext,
        iv,
        salt,
        hasPassword: Boolean(password),
        burnAfterRead,
        ttlSeconds: TTL_OPTIONS[ttlIndex].seconds,
      })

      // 3. Собираем ссылку: id от сервера + ключ в #. Фрагмент (#...) на сервер не отправляется.
      setResultUrl(`${window.location.origin}/secret/${res.data.id}#${urlKey}`)
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
    setPassword('')
    setBurnAfterRead(true)
    setTtlIndex(3)
    setResultUrl(null)
    setError(null)
    setCopied(false)
  }

  // --- Результат: готовая ссылка ---
  if (resultUrl) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600">
          Ссылка готова. Ключ шифрования зашит в саму ссылку (после <span className="font-mono">#</span>) —
          на сервер он не попал. Кто откроет ссылку — тот и расшифрует.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={resultUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={handleCopy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {copied ? 'Скопировано!' : 'Копировать'}
          </button>
        </div>
        {burnAfterRead && (
          <p className="flex items-start gap-1 text-xs text-gray-500">
            <WarnIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Сгорает после первого открытия — не проверяй ссылку сам, сразу отдай получателю.</span>
          </p>
        )}
        <button
          onClick={handleReset}
          className="self-start text-sm text-gray-500 hover:text-gray-800"
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
        className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль (необязательно)"
        className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={burnAfterRead}
          onChange={(e) => setBurnAfterRead(e.target.checked)}
        />
        Сжечь после первого прочтения
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        Срок жизни:
        <select
          value={ttlIndex}
          onChange={(e) => setTtlIndex(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-2 py-1"
        >
          {TTL_OPTIONS.map((opt, i) => (
            <option key={opt.label} value={i}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
