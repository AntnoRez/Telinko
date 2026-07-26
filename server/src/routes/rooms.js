import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  createRoom,
  getRoom,
  getLivekitToken,
  claimOrganizer,
} from '../controllers/roomController.js';
import {
  muteParticipant,
  askUnmute,
  kickParticipant,
} from '../controllers/moderationController.js';
import { uploadAttachment, downloadAttachment } from '../controllers/attachmentController.js';
import { requireAuth } from '../middleware/auth.js';

// Общий префикс '/api/rooms' навесим в app.js.
// Все роуты комнат — только для авторизованных, поэтому requireAuth на каждом.
const router = Router();

// Приём файлов вложений в память (буфер) — дальше сразу заливаем в MinIO. Лимит размера — из env.
const ATTACH_MAX_MB = parseInt(process.env.ATTACH_MAX_MB || '50', 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACH_MAX_MB * 1024 * 1024 },
});

// Rate limit на загрузку файлов, чтобы скрипт не забил MinIO. Ключ — userId (лимитер стоит
// ПОСЛЕ requireAuth, req.user уже есть): по IP резали бы живых людей за одним NAT (офис,
// мобильный оператор). Массовое создание аккаунтов и так прикрыто лимитом на регистрацию.
// Считаем ВСЕ запросы (не только успешные) — так тормозим сам цикл атаки.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30, // 30 загрузок за 15 минут на юзера — человеку с запасом, скрипт душит
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { error: 'Слишком много загрузок файлов. Подожди немного.' },
});

// Публичная проверка существования комнаты (getRoom) — вектор ПЕРЕБОРА: кастомные имена
// угадываемы (standup, daily…), а по 200/404 можно вычислять активные комнаты. Авторизации нет →
// ключуемся по IP (req.ip корректен: trust proxy=1 в app.js). 100/15мин человеку с запасом
// (несколько проверок имени + входов), а словарный перебор тормозит.
const roomLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подожди немного.' },
});

// Действия входа в комнату (токен LiveKit, «Я организатор») — авторизованные, ключ по userId
// (после requireAuth): по IP били бы живых людей за NAT. Штатно оба вызываются ~раз на вход,
// 40/15мин с запасом; защищают от долбёжки токенами/захватом организатора.
const roomJoinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { error: 'Слишком много попыток. Подожди немного.' },
});

router.post('/', requireAuth, createRoom); // создать комнату
// ПУБЛИЧНО (без requireAuth): проверка существования комнаты — не секрет (код и так нужен, чтобы
// зайти). Нужно, чтобы экран создания/входа мог ДО prejoin сказать «занято»/«не найдена».
router.get('/:code', roomLookupLimiter, getRoom); // проверить/получить комнату по коду
// История сообщений раздаётся сокетом (chat:history на room:join), а не REST — чтобы её нельзя
// было получить, не подключившись к комнате. Публичного /messages больше нет.
router.post('/:code/claim-organizer', requireAuth, roomJoinLimiter, claimOrganizer); // «Я организатор» → модератор + старт
router.post('/:code/livekit-token', requireAuth, roomJoinLimiter, getLivekitToken); // токен для входа в видеозвонок

// Модерация — только организатор (проверка внутри контроллеров через requireOrganizer).
router.post('/:code/moderate/mute', requireAuth, muteParticipant); // выключить мик/камеру/демку участнику
router.post('/:code/moderate/ask-unmute', requireAuth, askUnmute); // попросить включить (форсить нельзя)
router.post('/:code/moderate/kick', requireAuth, kickParticipant); // выгнать из звонка

// Вложения в чат. Upload: multer в память → MinIO; ошибку размера отдаём JSON'ом (иначе
// express вернул бы HTML-500). Download: авторизованный стриминг из приватного MinIO.
router.post(
  '/:code/attachments',
  requireAuth,
  uploadLimiter, // ПОСЛЕ requireAuth — лимитер ключуется по req.user.id
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return res
          .status(tooBig ? 413 : 400)
          .json({ error: tooBig ? `Файл больше ${ATTACH_MAX_MB} МБ` : 'Ошибка загрузки файла' });
      }
      next();
    });
  },
  uploadAttachment
);
router.get('/:code/attachments/:messageId', requireAuth, downloadAttachment);

export default router;
