import crypto from 'crypto';

// Случайный неугадываемый id для секрета. В отличие от кода комнаты, тут НЕ нужна
// читаемость (id живёт в ссылке, его не диктуют) — нужна непредсказуемость: id никто
// не должен подобрать перебором. 16 байт = 128 бит энтропии, base64url (~22 символа).
export function generateSecretId() {
  return crypto.randomBytes(16).toString('base64url');
}
