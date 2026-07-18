import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

// Router — мини-приложение Express, куда собираем группу роутов.
// Общий префикс '/api/auth' навесим при подключении в index.js.
const router = Router();

// --- Rate limiting (защита от брутфорса и спама) ---
// Лимитеры считают запросы ПО IP. На проде за реверс-прокси (nginx) понадобится
// app.set('trust proxy', 1), иначе все запросы придут «с одного IP» прокси.

// Логин: до 20 НЕУДАЧНЫХ попыток с одного IP за 15 минут.
// skipSuccessfulRequests — успешные входы не считаем: лимит бьёт только по перебору
// паролей, а не по честному юзеру, который часто логинится.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true, // отдаём RateLimit-заголовки (клиенту видно, сколько осталось)
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Подожди 15 минут.' },
});

// Регистрация: до 10 аккаунтов с одного IP в час. Здесь успешные запросы КАК РАЗ
// считаем — массовое создание аккаунтов и есть атака, от которой защищаемся.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много регистраций. Попробуй позже.' },
});

// Публичные — вход не нужен
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);

// Защищённые — сначала requireAuth (охранник), и только если пустил — хендлер
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);

export default router;
