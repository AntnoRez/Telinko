import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  me,
  logout,
  guestSession,
  quickRegister,
} from '../controllers/authController.js';
import { githubStart, githubCallback } from '../controllers/githubAuthController.js';
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

// Гостевой вход: temp-аккаунт создаётся на КАЖДЫЙ заход без логина, поэтому лимит щедрее —
// за одним IP через NAT (офис, мобильный оператор) могут сидеть много живых людей, и строгий
// лимит бил бы по ним. Режем только явный спам temp-аккаунтами (боты); их и так подберёт cron.
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много входов. Подожди немного.' },
});

// Одноклик-регистрация создаёт РЕАЛЬНЫЙ аккаунт — та же угроза массового создания, что и у
// /register, поэтому лимит умеренный (чуть щедрее обычной регистрации, т.к. это штатный путь).
const quickLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много быстрых регистраций. Попробуй позже.' },
});

// Старт GitHub-входа: не чаще 30 раз с IP за 15 минут (защита от абуза редиректов).
const githubLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа через GitHub. Подожди немного.' },
});

// Публичные — вход не нужен
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/guest', guestLimiter, guestSession); // гость по имени (temp-аккаунт)
router.post('/quick', quickLimiter, quickRegister); // одноклик-организатор (реальный аккаунт)

// GitHub OAuth: старт (редирект на GitHub) и callback (GitHub возвращает сюда). Callback НЕ
// лимитируем — его дёргает сам GitHub, а не клиент; защита — одноразовый state (CSRF).
router.get('/github', githubLimiter, githubStart);
router.get('/github/callback', githubCallback);

// Защищённые — сначала requireAuth (охранник), и только если пустил — хендлер
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);

export default router;
