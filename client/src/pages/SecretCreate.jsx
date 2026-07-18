import { Link } from 'react-router-dom'
import SecretCreateForm from '../components/SecretCreateForm'

// Страница создания секрета — тонкая обёртка над переиспользуемой формой.
// Публичная (отправитель может быть не залогинен).
function SecretCreate() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="flex items-center px-4 sm:px-6 py-4 border-b border-gray-200">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-800">
          ← На главную
        </Link>
      </header>

      <main className="mx-auto max-w-lg px-4 sm:px-6 py-8">
        <h1 className="mb-2 text-2xl font-semibold">Секретная ссылка</h1>
        <p className="mb-6 text-sm text-gray-500">
          Зашифруй сообщение прямо в браузере и получи одноразовую ссылку. Сервер хранит
          только шифротекст — содержимое он не видит.
        </p>

        <div className="rounded-2xl bg-white p-4 sm:p-6 shadow-sm">
          <SecretCreateForm />
        </div>
      </main>
    </div>
  )
}

export default SecretCreate
