import { Link, useLocation } from 'react-router-dom'
import SecretCreateForm from '../components/SecretCreateForm'
import GlowBackground from '../components/GlowBackground'
import { LockIcon } from '../components/icons'

// Страница создания секрета — тонкая обёртка над переиспользуемой формой (тёмная тема).
// Публичная (отправитель может быть не залогинен). prefill (из state навигации) — предзаполненный
// текст: сюда приходит ключ из генератора по кнопке «передать через секретку».
function SecretCreate() {
  const prefill = useLocation().state?.prefill || ''
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
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-500/20">
              <LockIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold">Секретная ссылка</h1>
          </div>
          <p className="mb-6 text-sm text-gray-400">
            Зашифруй сообщение прямо в браузере и получи одноразовую ссылку. Сервер хранит
            только шифротекст — содержимое он не видит.
          </p>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 sm:p-6 backdrop-blur-sm">
            <SecretCreateForm dark initialText={prefill} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default SecretCreate
