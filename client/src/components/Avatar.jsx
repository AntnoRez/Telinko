import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Аватар пользователя: есть картинка → кружок с ней, иначе градиентный кружок с буквой
// (тот же индиго→виолет, что в преджоине/участниках). Картинку тянем из /api/users/:id/avatar —
// куки уходят сами (dev :5173→:4000 = same-site; prod один origin). 404 (нет авы) → onError → буква.
//
// Свой юзер ЗНАЕТ, есть ли аватар (hasAvatar) и его версию (version, cache-bust) → не мигаем
// лишним 404. Для чужих hasAvatar не передаём: пробуем картинку, при 404 показываем букву.
export default function Avatar({ userId, name, size = 40, version, hasAvatar, className = '' }) {
  const [failed, setFailed] = useState(false)

  // Смена юзера/версии — новая попытка загрузки (сбрасываем прошлую ошибку).
  useEffect(() => {
    setFailed(false)
  }, [userId, version])

  const initial = ((name || '').trim().charAt(0) || '?').toUpperCase()
  const showImg = userId != null && hasAvatar !== false && !failed
  const src = `${API_BASE}/api/users/${userId}/avatar${version ? `?v=${version}` : ''}`
  const style = { width: size, height: size }

  if (showImg) {
    return (
      <img
        src={src}
        alt={name || ''}
        style={style}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      style={{ ...style, fontSize: Math.round(size * 0.42) }}
      aria-label={name || ''}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 font-semibold text-white ${className}`}
    >
      {initial}
    </div>
  )
}
