// Криптостойкая генерация ключей ЦЕЛИКОМ в браузере: crypto.getRandomValues (не Math.random)
// + rejection sampling — равномерный выбор символа из алфавита без перекоса. Наивный `byte % n`
// смещает распределение к началу алфавита, когда 256 не делится на n нацело; отбрасывая байты
// из «хвоста» (>= floor(256/n)*n), получаем строго равномерный выбор.

export const ALPHABETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
}

// Похожие/спорные символы — их можно исключить для читаемости и диктовки (0/O, 1/l/I и т.п.).
const AMBIGUOUS = new Set("O0oIl1|`'\"".split(''))

// Собрать алфавит из выбранных наборов; опц. выкинуть похожие символы.
export function buildAlphabet({ lower, upper, digits, symbols, noAmbiguous }) {
  let chars = ''
  if (lower) chars += ALPHABETS.lower
  if (upper) chars += ALPHABETS.upper
  if (digits) chars += ALPHABETS.digits
  if (symbols) chars += ALPHABETS.symbols
  if (noAmbiguous) chars = [...chars].filter((c) => !AMBIGUOUS.has(c)).join('')
  return chars
}

// Случайная строка длины length из alphabet, равномерно (rejection sampling).
export function randomString(length, alphabet) {
  const n = alphabet.length
  if (n === 0 || length <= 0) return ''
  const cutoff = Math.floor(256 / n) * n // байты >= cutoff отбрасываем ради равномерности
  const out = []
  const buf = new Uint8Array(Math.max(length, 16))
  while (out.length < length) {
    crypto.getRandomValues(buf)
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < cutoff) out.push(alphabet[buf[i] % n])
    }
  }
  return out.join('')
}

// Сгенерировать count ключей с необязательным префиксом (префикс в энтропию не входит).
export function generateKeys({ count, length, prefix, alphabet }) {
  const keys = []
  for (let i = 0; i < count; i++) keys.push((prefix || '') + randomString(length, alphabet))
  return keys
}

// Примерная энтропия ключа в битах: length * log2(|alphabet|). Для подсказки силы ключа.
export function entropyBits(length, alphabetSize) {
  if (alphabetSize < 2 || length <= 0) return 0
  return Math.floor(length * Math.log2(alphabetSize))
}
