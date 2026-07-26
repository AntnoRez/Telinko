import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { updateMe, uploadAvatar, removeAvatar, getAvatar, AVATAR_TYPES } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';

// Профиль текущего юзера: сменить имя, загрузить/убрать аватар; раздача аватаров.
const router = Router();

// Аватар клиент присылает уже сжатым (≤512px), так что 2 МБ — с большим запасом. В память,
// дальше сразу в MinIO. Тип — только растровый whitelist (AVATAR_TYPES из контроллера): SVG
// не пускаем (может нести <script> → XSS при прямом открытии URL аватара).
const AVATAR_MAX_MB = 2;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (AVATAR_TYPES.has(file.mimetype)) cb(null, true);
    else cb(null, false); // не в whitelist — молча отбросим, контроллер вернёт 400 (req.file пуст)
  },
});

// Rate limit на загрузку аватара — как uploadLimiter в rooms: ключ req.user.id (ПОСЛЕ requireAuth),
// чтобы скрипт не гонял записи в MinIO. Смена имени не лимитируется (пишет только строку в БД).
const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { error: 'Слишком часто меняешь аватар. Подожди немного.' },
});

router.patch('/me', requireAuth, updateMe); // сменить имя
router.post(
  '/me/avatar',
  requireAuth,
  avatarLimiter, // ПОСЛЕ requireAuth — лимитер ключуется по req.user.id
  (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
      if (err) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return res
          .status(tooBig ? 413 : 400)
          .json({ error: tooBig ? `Файл больше ${AVATAR_MAX_MB} МБ` : 'Ошибка загрузки файла' });
      }
      next();
    });
  },
  uploadAvatar
);
router.delete('/me/avatar', requireAuth, removeAvatar); // убрать аватар
router.get('/:id/avatar', requireAuth, getAvatar); // раздать аватар по id юзера

export default router;
