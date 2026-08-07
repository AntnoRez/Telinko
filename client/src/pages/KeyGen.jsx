import { Link } from 'react-router-dom'
import KeyGenForm from '../components/KeyGenForm'
import GlowBackground from '../components/GlowBackground'
import { KeyIcon } from '../components/icons'

// Страница генератора ключей — тонкая обёртка над переиспользуемой формой (тёмная тема).
// Публичная, полностью клиентская (ключи генерятся в браузере, сервер не задействован).
function KeyGen() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-neutral-950 text-gray-100">
      <GlowBackground variant="sky" />

      <div className="relative">
        <header className="mx-auto flex max-w-lg items-center px-4 sm:px-6 py-4">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-100">
            ← На главную
          </Link>
        </header>

        <main className="mx-auto max-w-lg px-4 sm:px-6 pb-12">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/20">
              <KeyIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold">Генератор ключей</h1>
          </div>
          <p className="mb-6 text-sm text-gray-400">
            Случайные ключи и пароли, сгенерированные прямо в браузере криптостойким генератором.
            Настрой символы, длину и префикс — и передай ключ одноразовой секретной ссылкой.
          </p>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 sm:p-6 backdrop-blur-sm">
            <KeyGenForm />
          </div>
        </main>
      </div>
    </div>
  )
}

export default KeyGen
