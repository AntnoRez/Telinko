// Фоновое «голубое свечение» — единый тёмный вайб на всех экранах (главная, преджоин, звонок,
// секреты). Раньше этот блок копипастился по 5 страницам; теперь одна точка правки.
// variant: 'sky' (дефолт) | 'blue' (секреты) | 'home' (два пятна на главной).
// Классы цвета заданы литералами (не через шаблон) — иначе Tailwind не увидит их при сборке.
export default function GlowBackground({ variant = 'sky' }) {
  if (variant === 'home') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-sky-600/20 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 h-[30rem] w-[30rem] rounded-full bg-blue-600/10 blur-[140px]" />
      </div>
    )
  }
  const color = variant === 'blue' ? 'bg-blue-600/15' : 'bg-sky-600/15'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={`absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full ${color} blur-[140px]`} />
    </div>
  )
}
