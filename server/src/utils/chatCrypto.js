import crypto from 'crypto';

// Шифрование чата «at-rest»: в Postgres тексты сообщений и имена вложений лежат ШИФРОТЕКСТОМ,
// а не в открытом виде. Закрывает дамп БД / бэкап / SQL-инъекцию. Это НЕ E2E: сервер держит
// ключ и видит открытый текст в памяти (как и медиапоток звонка) — модель «сервер доверенный».
//
// Алгоритм: AES-256-GCM (шифр + аутентификация в одном: подделку шифротекста поймаем на теге).
// Формат хранимого значения: `enc:v1:` + base64( iv[12] ‖ authTag[16] ‖ ciphertext ).
// Префикс-версия нужна, чтобы (а) отличать шифротекст от легаси-плейнтекста, (б) сменить схему позже.

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // рекомендованный размер nonce для GCM
const TAG_LEN = 16; // тег аутентификации GCM
const PREFIX = 'enc:v1:';

// Ключ читаем ЛЕНИВО (не на импорте): к моменту вызова dotenv уже загрузил .env.
// 32 байта (AES-256), приходит из CHAT_ENC_KEY в base64.
function getKey() {
  const raw = process.env.CHAT_ENC_KEY;
  if (!raw) throw new Error('CHAT_ENC_KEY не задан — чат нельзя шифровать');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`CHAT_ENC_KEY должен быть 32 байта в base64 (сейчас ${key.length})`);
  }
  return key;
}

// Проверка ключа на старте сервера — падаем ГРОМКО, а не молча пишем плейнтекст в БД,
// если ключ забыли/кривой. Вызывается из index.js до listen().
export function assertChatKey() {
  getKey();
}

// Открытый текст → хранимое значение (`enc:v1:...`). null пробрасываем как null
// (у сообщения может не быть текста — только вложение).
export function encryptText(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

// Хранимое значение → открытый текст. Легаси-толерантность: значение без префикса `enc:v1:`
// (старые плейнтекст-строки) возвращаем как есть — миграция не нужна.
export function decryptText(stored) {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored; // легаси-плейнтекст
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag); // при подделке шифротекста/тега final() бросит
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
