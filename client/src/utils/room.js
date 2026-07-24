// Утилиты для работы с кодом/именем комнаты (чистые функции, без сети).

// Вытаскивает КОД комнаты из того, что вставил юзер. Это может быть:
//   • чистый код         — "abc-d2f"  или  "FggaGgHh"
//   • полная ссылка      — "https://telinko.online/room/abc-d2f#key"
//   • ссылка с хвостом    — ".../room/abc-d2f/?x=1#frag"
// Логика: если есть "/room/" — берём часть после ПОСЛЕДНЕГО вхождения; затем в любом случае
// отрезаем всё от первого '/', '?' или '#' (путь/квери/фрагмент). Пустой/не строка → ''.
export function extractRoomCode(input) {
  if (typeof input !== 'string') return ''
  let s = input.trim()

  const marker = '/room/'
  const i = s.lastIndexOf(marker)
  if (i !== -1) {
    s = s.slice(i + marker.length)
  }

  // отрезаем хвост: путь / query / hash. Дефис и подчёркивание остаются (валидны в коде).
  s = s.split(/[/?#]/)[0]
  return s.trim()
}

// Отображаемое ИМЯ комнаты из её кода: разбиваем CamelCase на слова — ставим пробел перед
// каждой заглавной буквой (кроме самой первой). Заглавных нет → возвращаем код как есть.
//   "FggaGgHh"   → "Fgga Gg Hh"
//   "fhdbdbdhxh" → "fhdbdbdhxh"
//   "abc-d2f"    → "abc-d2f"
export function roomDisplayName(code) {
  if (typeof code !== 'string') return ''
  return code.replace(/([A-Z])/g, ' $1').trim()
}
