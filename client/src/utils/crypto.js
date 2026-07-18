// Клиентское шифрование секретов (zero-knowledge). Всё происходит в браузере через
// Web Crypto API — сервер видит только шифротекст + несекретные iv/salt.
//
// Схема:
//   urlKey (32 байта, случайные) → живёт в URL после #, на сервер НЕ уходит
//   salt   (16 байт) + iv (12 байт) → на сервер (это НЕ секреты)
//   aesKey = PBKDF2(urlKey [+ пароль], salt, 100k, SHA-256)
//   ciphertext = AES-GCM(aesKey, iv, текст)
// Пароль (опционально) подмешивается в PBKDF2 — тогда без него ключ не собрать.

// --- base64url <-> байты (url-безопасно: без +, /, =) ---
function bytesToBase64url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n))
}

// Собираем AES-ключ из ключа-из-URL (+ пароль, если задан) и соли через PBKDF2.
// PBKDF2 нужен, чтобы чисто скомбинировать urlKey + пароль в один ключ и растянуть
// слабый пароль (защита от перебора).
async function deriveKey(urlKeyBytes, password, saltBytes) {
  const enc = new TextEncoder()
  const pwBytes = password ? enc.encode(password) : new Uint8Array(0)

  // материал = urlKey ++ пароль
  const material = new Uint8Array(urlKeyBytes.length + pwBytes.length)
  material.set(urlKeyBytes, 0)
  material.set(pwBytes, urlKeyBytes.length)

  const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Зашифровать текст. Возвращает всё, что нужно: urlKey (в ссылку) + блоб/iv/salt (на сервер).
export async function encryptSecret(text, password) {
  const urlKey = randomBytes(32)
  const salt = randomBytes(16)
  const iv = randomBytes(12)

  const key = await deriveKey(urlKey, password, salt)
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text) // UTF-8 → корректно шифрует кириллицу и эмодзи
  )

  return {
    urlKey: bytesToBase64url(urlKey), // в URL после #
    ciphertext: bytesToBase64url(new Uint8Array(ciphertextBuf)), // на сервер
    iv: bytesToBase64url(iv),
    salt: bytesToBase64url(salt),
  }
}

// Расшифровать. Неверный пароль (или повреждённые данные) → AES-GCM бросит исключение
// (GCM проверяет целостность) → вызывающий код покажет "неверный пароль".
export async function decryptSecret({ ciphertext, iv, salt }, urlKey, password) {
  const key = await deriveKey(base64urlToBytes(urlKey), password, base64urlToBytes(salt))
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64urlToBytes(iv) },
    key,
    base64urlToBytes(ciphertext)
  )
  return new TextDecoder().decode(plainBuf) // байты → UTF-8 строка
}
