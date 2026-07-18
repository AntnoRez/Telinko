import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createSecret, getMeta, consumeSecret } from '../controllers/secretController.js';

// Префикс '/api/secrets' навесим в app.js. Роуты ПУБЛИЧНЫЕ (без requireAuth):
// и отправитель, и получатель секрета могут быть не залогинены.
const router = Router();

// Создание секретов: до 30 с одного IP в час. Роут публичный и принимает до 100 КБ
// за запрос — без лимита скрипт в цикле забил бы БД мусором (30/час ≈ 3 МБ/час с IP,
// а честному юзеру больше и не нужно). Считаем ВСЕ запросы: успешное создание
// и есть то, что ограничиваем. См. заметку про trust proxy в routes/auth.js.
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много секретов. Попробуй позже.' },
});

router.post('/', createLimiter, createSecret); // создать секрет → { id }
router.get('/:id/meta', getMeta); // метаданные { exists, hasPassword } — НЕ сжигает
router.post('/:id', consumeSecret); // забрать шифроблоб — сжигает, если burnAfterRead

export default router;
