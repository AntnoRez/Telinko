import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import { decryptSecret } from '../utils/crypto'
import { useCopied } from '../utils/useCopied'
import GlowBackground from '../components/GlowBackground'

// Забрать шифроблоб РОВНО ОДИН РАЗ на id за время жизни вкладки. consume — одноразовый (POST
// сжигает секрет): без этого кэша StrictMode (dev — двойной mount) или любой ре-рендер сделали
// бы второй POST, который вернул бы 404 → ложный «секрет не найден». Map живёт на уровне модуля,
// поэтому переживает ремоунт компонента (в отличие от useRef, который при ремоунте пересоздаётся).
const consumePromises = new Map()
function consumeOnce(id) {
  if (!consumePromises.has(id)) {
    const p = api.post(`/api/secrets/${id}`).then((r) => r.data)
    // Успех держим навсегда (второй POST сжёг бы секрет повторно → 404). А вот неудачу (сеть/404)
    // из кэша убираем: при 404 повтор тоже даст 404 (безвредно), а сетевую ошибку можно переиграть,
    // вернувшись на страницу, — иначе rejected-промис завис бы до полной перезагрузки вкладки.
    p.catch(() => consumePromises.delete(id))
    consumePromises.set(id, p)
  }
  return consumePromises.get(id)
}

// Страница просмотра секрета. Ключ шифрования берём из #-фрагмента ссылки (на сервер он никогда
// не уходит). Секрет показывается СРАЗУ при открытии (без кнопки): забираем шифроблоб (POST —
// сжигает) и расшифровываем в браузере. Открыл ссылку — секрет израсходован (он одноразовый).
function SecretView() {
  const { id } = useParams()
  const urlKey = window.location.hash.slice(1) // ключ после '#', без самой решётки

  const [status, setStatus] = useState('loading') // loading|badlink|notfound|revealed|error
  const [secretText, setSecretText] = useState('')
  const [error, setError] = useState(null)
  const [copied, copyText] = useCopied()

  // При открытии: сразу consume (сжигает) + расшифровка. consumeOnce гарантирует единственный POST.
  useEffect(() => {
    let cancelled = false
    if (!urlKey) {
      setStatus('badlink') // ссылка без ключа — расшифровать нечем, сервер не трогаем
      return
    }

    async function run() {
      // 1. Забираем шифроблоб (POST — сжигает, ровно один раз на id).
      let blob
      try {
        blob = await consumeOnce(id)
      } catch (err) {
        if (cancelled) return
        // 404 → секрет уже сгорел/истёк; иначе сеть/сервер.
        setStatus(err?.response?.status === 404 ? 'notfound' : 'error')
        return
      }
      if (cancelled) return

      // 2. Расшифровка локально ключом из #. Битый ключ/повреждённые данные → AES-GCM бросит.
      try {
        const text = await decryptSecret(blob, urlKey)
        if (cancelled) return
        setSecretText(text)
        setStatus('revealed')
      } catch {
        if (cancelled) return
        setError('Не удалось расшифровать секрет — возможно, ссылка повреждена.')
        setStatus('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [id, urlKey])

  return (
    <div className="relative min-h-dvh overflow-hidden bg-neutral-950 text-gray-100">
      <GlowBackground variant="blue" />

      <div className="relative">
        <header className="mx-auto flex max-w-lg items-center px-4 sm:px-6 py-4">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-100">
            ← На главную
          </Link>
        </header>

        <main className="mx-auto max-w-lg px-4 sm:px-6 pb-12">
          <h1 className="mb-6 text-2xl font-semibold">Секретное сообщение</h1>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 sm:p-6 backdrop-blur-sm">
            {status === 'loading' && <p className="text-gray-400">Расшифровка…</p>}

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

            {status === 'error' && (
              <p className="text-red-400">{error || 'Не удалось загрузить секрет.'}</p>
            )}

            {status === 'revealed' && (
              <div className="flex flex-col gap-4">
                <div className="whitespace-pre-wrap break-words rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-gray-100">
                  {secretText}
                </div>
                <button
                  onClick={() => copyText(secretText)}
                  className="self-start rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
                >
                  {copied ? 'Скопировано!' : 'Копировать'}
                </button>
                <p className="text-xs text-gray-500">
                  Сохрани содержимое сейчас — секрет одноразовый, повторно ссылка уже не откроется.
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
