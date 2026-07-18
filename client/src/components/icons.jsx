// Монохромные плоские иконки (обводка currentColor). Размер и цвет наследуют от родителя
// через className (напр. "w-6 h-6 text-gray-700"). Стиль как у SpeakerIcon/FullscreenIcon.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
}

// Видеокамера — плитка «Видео звонки».
export function VideoIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  )
}

// Замок — плитка «Секретные ссылки», кнопка «Секретка», значок «нужен вход».
export function LockIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

// Треугольник с восклицанием — предупреждение о burn.
export function WarnIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
