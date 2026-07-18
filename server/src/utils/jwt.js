import jwt from 'jsonwebtoken';

// Одно место, где живёт работа с JWT: секрет и срок жизни берём из .env.
// И контроллер (при логине), и middleware (при проверке) ходят сюда,
// чтобы секрет не был раскопирован по всему коду.

// Подписываем токен. payload — что кладём внутрь (у нас { userId }).
// Фолбэк '7d' обязателен: без него забытая переменная JWT_EXPIRES_IN означала бы
// expiresIn: undefined — и jwt.sign МОЛЧА выпускал бы вечные токены.
export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Проверяем токен. Если он битый или протух — jwt.verify бросит ошибку.
export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
