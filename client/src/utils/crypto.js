// Клиентское шифрование секретов (zero-knowledge). Всё происходит в браузере через
// Web Crypto API — сервер видит только шифротекст + несекретный iv.
//
// Схема (без пароля — ключ целиком в ссылке):
//   urlKey (32 случайных байта) → живёт в URL после #, на сервер НЕ уходит.
//                                 Это сразу и есть 256-битный AES-ключ.
//   iv (12 байт) → на сервер (это НЕ секрет).
//   ciphertext = AES-GCM(urlKey, iv, текст)
// PBKDF2/пароль/соль убраны намеренно: urlKey — уже полноценный случайный ключ, растягивать
// (как слабый пароль) нечего. Кто получил ссылку целиком — тот и расшифрует.

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

// urlKey (32 байта) импортируем напрямую как AES-GCM ключ — без деривации.
function importAesKey(urlKeyBytes) {
  return crypto.subtle.importKey('raw', urlKeyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

// Зашифровать текст. Возвращает urlKey (в ссылку) + ciphertext/iv (на сервер).
export async function encryptSecret(text) {
  const urlKey = randomBytes(32)
  const iv = randomBytes(12)

  const key = await importAesKey(urlKey)
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text) // UTF-8 → корректно шифрует кириллицу и эмодзи
  )

  return {
    urlKey: bytesToBase64url(urlKey), // в URL после #
    ciphertext: bytesToBase64url(new Uint8Array(ciphertextBuf)), // на сервер
    iv: bytesToBase64url(iv),
  }
}

// Расшифровать. Битый ключ/повреждённые данные → AES-GCM бросит исключение (GCM проверяет
// целостность) → вызывающий код покажет ошибку.
export async function decryptSecret({ ciphertext, iv }, urlKey) {
  const key = await importAesKey(base64urlToBytes(urlKey))
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64urlToBytes(iv) },
    key,
    base64urlToBytes(ciphertext)
  )
  return new TextDecoder().decode(plainBuf) // байты → UTF-8 строка
}
