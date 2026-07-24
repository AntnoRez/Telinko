import { Router } from 'express';
import multer from 'multer';
import {
  createRoom,
  getRoom,
  getMessages,
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

router.post('/', requireAuth, createRoom); // создать комнату
// ПУБЛИЧНО (без requireAuth): проверка существования комнаты — не секрет (код и так нужен, чтобы
// зайти). Нужно, чтобы экран создания/входа мог ДО prejoin сказать «занято»/«не найдена».
router.get('/:code', getRoom); // проверить/получить комнату по коду
router.get('/:code/messages', requireAuth, getMessages); // история сообщений
router.post('/:code/claim-organizer', requireAuth, claimOrganizer); // «Я организатор» → стать модератором + старт звонка
router.post('/:code/livekit-token', requireAuth, getLivekitToken); // токен для входа в видеозвонок

// Модерация — только организатор (проверка внутри контроллеров через requireOrganizer).
router.post('/:code/moderate/mute', requireAuth, muteParticipant); // выключить мик/камеру/демку участнику
router.post('/:code/moderate/ask-unmute', requireAuth, askUnmute); // попросить включить (форсить нельзя)
router.post('/:code/moderate/kick', requireAuth, kickParticipant); // выгнать из звонка

// Вложения в чат. Upload: multer в память → MinIO; ошибку размера отдаём JSON'ом (иначе
// express вернул бы HTML-500). Download: авторизованный стриминг из приватного MinIO.
router.post(
  '/:code/attachments',
  requireAuth,
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
