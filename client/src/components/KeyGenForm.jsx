import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildAlphabet, generateKeys, entropyBits } from '../utils/keygen'
import { useCopied } from '../utils/useCopied'

// Одна строка результата: моноширинный ключ + «копировать», опц. «передать через секретку».
function KeyRow({ value, onSend }) {
  const [copied, copy] = useCopied()
  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2">
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-gray-100" title={value}>{value}</span>
      {onSend && (
        <button
          type="button"
          onClick={() => onSend(value)}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-100"
          title="Передать этот ключ одноразовой секретной ссылкой"
        >
          через секретку
        </button>
      )}
      <button
        type="button"
        onClick={() => copy(value)}
        className="shrink-0 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
      >
        {copied ? '✓' : 'Копировать'}
      </button>
    </div>
  )
}

// Чекбокс набора символов.
function SetToggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-sky-500" />
      {label}
    </label>
  )
}

// Генератор случайных ключей/паролей. Всё в браузере (crypto.getRandomValues) — сервер не нужен.
// Настраиваемо: наборы символов, длина, префикс, количество.
// onSendToSecret(value) (опц.): куда отдать ключ по кнопке «через секретку». В звонке/чате — колбэк,
// открывающий секретку НА МЕСТЕ (модалкой), чтобы не уводить со страницы. На странице /keygen проп
// не задан → уходим навигацией на /secret с предзаполненным текстом.
function KeyGenForm({ onSendToSecret }) {
  const navigate = useNavigate()
  const [sets, setSets] = useState({ lower: true, upper: true, digits: true, symbols: false })
  const [noAmbiguous, setNoAmbiguous] = useState(false)
  const [length, setLength] = useState('24')
  const [prefix, setPrefix] = useState('')
  const [count, setCount] = useState('1')
  const [keys, setKeys] = useState([])

  const [copiedAll, copyAll] = useCopied()

  const alphabet = useMemo(
    () => buildAlphabet({ ...sets, noAmbiguous }),
    [sets, noAmbiguous]
  )
  // Длину/количество держим как СТРОКУ ввода — чтобы поле можно было полностью стереть и
  // перепечатать (иначе «1» залипала и не стиралась). Валидируем при генерации; пустое поле →
  // canGenerate=false, ключ не генерится.
  const len = parseInt(length, 10)
  const cnt = parseInt(count, 10)
  const canGenerate = alphabet.length > 0 && len >= 1 && cnt >= 1
  const bits = len >= 1 ? entropyBits(Math.min(len, 256), alphabet.length) : 0

  function setField(key, checked) {
    setSets((s) => ({ ...s, [key]: checked }))
  }

  function handleGenerate(e) {
    e.preventDefault()
    if (!canGenerate) return
    setKeys(generateKeys({ count: Math.min(50, cnt), length: Math.min(256, len), prefix: prefix.trim(), alphabet }))
  }

  // Значение → на страницу секретки с предзаполненным текстом (state.prefill). Для «всё в секретку»
  // передаём все ключи по одному на строку.
  function sendViaSecret(value) {
    if (onSendToSecret) onSendToSecret(value)
    else navigate('/secret', { state: { prefill: value } })
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleGenerate} className="flex flex-col gap-4">
        {/* Наборы символов */}
        <div>
          <div className="mb-2 text-sm text-gray-400">Символы в ключе</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SetToggle checked={sets.lower} onChange={(v) => setField('lower', v)} label="a–z" />
            <SetToggle checked={sets.upper} onChange={(v) => setField('upper', v)} label="A–Z" />
            <SetToggle checked={sets.digits} onChange={(v) => setField('digits', v)} label="0–9" />
            <SetToggle checked={sets.symbols} onChange={(v) => setField('symbols', v)} label="!@#$…" />
          </div>
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={noAmbiguous} onChange={(e) => setNoAmbiguous(e.target.checked)} className="accent-sky-500" />
            Без похожих символов (0/O, 1/l/I)
          </label>
          {alphabet.length === 0 && (
            <p className="mt-1 text-xs text-red-400">Выбери хотя бы один набор символов.</p>
          )}
        </div>

        {/* Длина / количество */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Длина
            <input
              type="number"
              min={4}
              max={256}
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Сколько ключей
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
        </div>

        {/* Префикс */}
        <label className="flex flex-col gap-1 text-sm text-gray-400">
          Префикс (необязательно)
          <input
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="напр. sk-"
            maxLength={32}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {alphabet.length > 0 && `≈ ${bits} бит энтропии на ключ`}
          </span>
          <button
            type="submit"
            disabled={!canGenerate}
            className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Сгенерировать
          </button>
        </div>
      </form>

      {/* Результат */}
      {keys.length > 0 && (
        <div className="flex flex-col gap-2">
          {keys.map((k, i) => (
            <KeyRow key={i} value={k} onSend={sendViaSecret} />
          ))}
          {keys.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => copyAll(keys.join('\n'))}
                className="text-sm text-gray-400 hover:text-gray-100"
              >
                {copiedAll ? 'Скопировано!' : 'Копировать все'}
              </button>
              <button
                type="button"
                onClick={() => sendViaSecret(keys.join('\n'))}
                className="text-sm text-gray-400 hover:text-gray-100"
              >
                Всё в секретку
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Ключи сгенерированы в браузере и никуда не отправлены. Нужно передать безопасно —
            кнопка «через секретку».
          </p>
        </div>
      )}
    </div>
  )
}

export default KeyGenForm
