import { useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import Avatar from './Avatar'

// Модалка профиля: сменить имя и загрузить/убрать аватар. Логин/email/пароль не трогаем.
// Аватар применяется сразу при выборе файла; имя — по кнопке «Сохранить». Тёмная тема как у
// модалки «Стать организатором».
export default function ProfileModal({ onClose }) {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar)
  const removeAvatar = useAuthStore((s) => s.removeAvatar)

  const [name, setName] = useState(user?.displayName ?? '')
  const [savingName, setSavingName] = useState(false)
  const [saved, setSaved] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  if (!user) return null

  const hasAvatar = user.avatarVersion != null
  const nameChanged = name.trim().length > 0 && name.trim() !== user.displayName

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // сброс: повторный выбор того же файла тоже сработает
    if (!file) return
    setError(null)
    setAvatarBusy(true)
    try {
      await uploadAvatar(file)
    } catch (err) {
      setError(err?.response?.data?.error || 'Не удалось загрузить аватар')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onRemove() {
    setError(null)
    setAvatarBusy(true)
    try {
      await removeAvatar()
    } catch {
      setError('Не удалось убрать аватар')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onSaveName() {
    if (!nameChanged) return
    setError(null)
    setSavingName(true)
    setSaved(false)
    try {
      await updateProfile(name.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      setError(err?.response?.data?.error || 'Не удалось сохранить имя')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-gray-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Профиль</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200" aria-label="Закрыть">✕</button>
        </div>

        {/* Аватар + действия */}
        <div className="mb-5 flex flex-col items-center gap-3">
          <Avatar
            userId={user.id}
            name={user.displayName}
            size={96}
            hasAvatar={hasAvatar}
            version={user.avatarVersion}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {avatarBusy ? 'Загрузка…' : hasAvatar ? 'Сменить фото' : 'Загрузить фото'}
            </button>
            {hasAvatar && (
              <button
                type="button"
                onClick={onRemove}
                disabled={avatarBusy}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition hover:bg-neutral-800 hover:text-gray-200 disabled:opacity-50"
              >
                Убрать
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        </div>

        {/* Имя */}
        <label className="mb-1 block text-sm text-gray-400">Имя</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSaveName()}
            maxLength={50}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={onSaveName}
            disabled={!nameChanged || savingName}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {savingName ? '…' : saved ? '✓' : 'Сохранить'}
          </button>
        </div>

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
