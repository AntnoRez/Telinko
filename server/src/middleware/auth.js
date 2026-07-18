import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/index.js';

// Middleware-«охранник»: ставим его перед роутами, которые требуют входа.
// Если всё хорошо — кладёт текущего юзера в req.user и пускает дальше (next()).
// Если нет — обрывает запрос ответом 401 (Unauthorized).
export async function requireAuth(req, res, next) {
  // Токен лежит в httpOnly cookie под именем 'token'.
  // req.cookies появляется благодаря cookie-parser (подключим в index.js).
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Не авторизован' });
  }

  try {
    const payload = verifyToken(token); // валиден → payload с userId; иначе бросит ошибку
    const user = await User.findByPk(payload.userId);

    if (!user) {
      // токен валиден, но юзера уже нет (удалён) — не пускаем
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = user; // дальше роут знает, кто пришёл
    next();
  } catch {
    // подпись не сошлась или токен протух
    return res.status(401).json({ error: 'Не авторизован' });
  }
}
