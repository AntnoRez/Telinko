import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import { decryptSecret } from '../utils/crypto'

// Страница просмотра секрета. Ключ шифрования берём из #-фрагмента ссылки (на сервер он
// никогда не уходит). Порядок: meta (GET, не сжигает) → показать → consume (POST, сжигает)
// → расшифровать в браузере.
function SecretView() {
  const { id } = useParams()
  const urlKey = window.location.hash.slice(1) // ключ после '#', без самой решётки

  const [status, setStatus] = useState('loading') // loading|badlink|notfound|ready|revealed|error
  const [secretText, setSecretText] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  // Шаг 1: метаданные по GET (НЕ сжигает — важно для превью-ботов).
  useEffect(() => {
    let cancelled = false
    if (!urlKey) {
      setStatus('badlink')
      return
    }
    api
      .get(`/api/secrets/${id}/meta`)
      .then((res) => {
        if (cancelled) return
        if (!res.data.exists) {
          setStatus('notfound')
          return
        }
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id, urlKey])

  // Шифроблоб, уже полученный с сервера. Храним его, чтобы при неверном пароле
  // НЕ ходить на сервер второй раз: burn-секрет сгорает при первом же consume,
  // и повторный POST вернул бы 404 — хотя данные для новой попытки уже у нас.
  const blobRef = useRef(null)

  // Шаг 2: забрать шифроблоб (POST — сжигает, если burn) и расшифровать.
  async function handleReveal(e) {
    e?.preventDefault()
    setError(null)
    setRevealing(true)

    // 2a. Забираем блоб с сервера только один раз, дальше работаем с сохранённым.
    if (!blobRef.current) {
      try {
        const res = await api.post(`/api/secrets/${id}`) // consume
        blobRef.current = res.data
      } catch (err) {
        if (err.response?.status === 404) {
          // Секрет уже сгорел или истёк.
          setStatus('notfound')
        } else {
          // Сеть/сервер: блоб не получили, секрет НЕ израсходован — можно повторить.
          setError('Не удалось получить секрет с сервера. Попробуй ещё раз.')
        }
        setRevealing(false)
        return
      }
    }

    // 2b. Расшифровка локально ключом из #. Битый ключ/повреждённые данные → AES-GCM бросит.
    try {
      const text = await decryptSecret(blobRef.current, urlKey)
      setSecretText(text)
      setStatus('revealed')
    } catch {
      setError('Не удалось расшифровать секрет')
    } finally {
      setRevealing(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secretText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен — игнорируем
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-gray-100">
      {/* Индиго-свечение — единый тёмный вайб. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[140px]" />
      </div>

      <div className="relative">
        <header className="mx-auto flex max-w-lg items-center px-4 sm:px-6 py-4">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-100">
            ← На главную
          </Link>
        </header>

        <main className="mx-auto max-w-lg px-4 sm:px-6 pb-12">
          <h1 className="mb-6 text-2xl font-semibold">Секретное сообщение</h1>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 sm:p-6 backdrop-blur-sm">
            {status === 'loading' && <p className="text-gray-400">Загрузка…</p>}

            {status === 'badlink' && (
              <p className="text-red-400">
                Ссылка неполная — в ней нет ключа расшифровки (часть после #). Попроси прислать
                ссылку целиком.
              </p>
            )}

            {status === 'notfound' && (
              <p className="text-gray-300">
                Секрет не найден. Возможно, он уже был открыт или истёк срок ссылки.
              </p>
            )}

            {status === 'error' && <p className="text-red-400">Не удалось загрузить секрет.</p>}

            {status === 'ready' && (
              <form onSubmit={handleReveal} className="flex flex-col gap-4">
                <p className="text-sm text-gray-400">
                  Нажми, чтобы расшифровать и показать секрет. Он одноразовый — после этого сгорит.
                </p>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={revealing}
                  className="self-start rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {revealing ? 'Расшифровка…' : 'Показать секрет'}
                </button>
              </form>
            )}

            {status === 'revealed' && (
              <div className="flex flex-col gap-4">
                <div className="whitespace-pre-wrap break-words rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-gray-100">
                  {secretText}
                </div>
                <button
                  onClick={handleCopy}
                  className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                >
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
                <p className="text-xs text-gray-500">
                  Сохрани содержимое сейчас — если ссылка была одноразовой, повторно она уже не откроется.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default SecretView
