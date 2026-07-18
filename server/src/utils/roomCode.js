import crypto from 'crypto';

// Алфавит без похожих символов (нет 0/o, 1/l/i) — чтобы код было легко
// продиктовать и не перепутать.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

// Генерирует код вида "abc-d2f" — три символа, дефис, ещё три. Читаемо и коротко.
export function generateRoomCode() {
  const pick = (n) =>
    Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `${pick(3)}-${pick(3)}`;
}
