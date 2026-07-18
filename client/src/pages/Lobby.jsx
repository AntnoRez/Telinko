import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore } from '../store/authStore'

function Lobby() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)

  // Создать новую комнату → сервер вернёт код → уходим в неё.
  async function handleCreate() {
    setError(null)
    setCreating(true)
    try {
      const res = await api.post('/api/rooms')
      navigate(`/room/${res.data.room.code}`)
    } catch {
      setError('Не удалось создать комнату')
      setCreating(false)
    }
  }

  // Войти по коду → сначала проверяем, что комната существует, потом переходим.
  async function handleJoin(e) {
    e.preventDefault() // отменяем действия по умолчанию что бы провернуть свои
    setError(null)
    const trimmed = code.trim()
    if (!trimmed) return
    try {
      await api.get(`/api/rooms/${trimmed}`)
      navigate(`/room/${trimmed}`)
    } catch {
      setError('Комната не найдена')
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/') // на публичную главную
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800">
      {/* Шапка */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← На главную
          </Link>
          <span className="font-medium">{user?.displayName}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600"
        >
          Выйти
        </button>
      </header>

      {/* Центр */}
      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <h1 className="text-3xl font-semibold">Rooms</h1>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Создаём…' : 'Создать комнату'}
        </button>

        <div className="text-gray-400">или</div>

        <form onSubmit={handleJoin} className="flex gap-2 w-full max-w-sm">
          <input
            type="text"
            placeholder="Код комнаты (напр. abc-d2f)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            className="bg-gray-200 text-gray-800 rounded-lg px-4 py-2 font-medium hover:bg-gray-300"
          >
            Войти
          </button>
        </form>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </main>
    </div>
  )
}

export default Lobby
