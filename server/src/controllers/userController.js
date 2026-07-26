import { randomUUID } from 'crypto';
import { User } from '../models/index.js';
import { putObject, getObject, deleteObjects } from '../config/s3.js';
import { publicUser } from './authController.js';

// Whitelist ТОЛЬКО растровых типов аватара. НЕ пускаем image/svg+xml: SVG может нести <script>,
// и при прямом переходе на URL аватара браузер отрендерил бы его как документ нашего origin = XSS
// (nosniff тут не спасает). Растр безопасен. Совпадает с тем, что шлёт клиент (image/jpeg).
// Проверяем в ДВУХ местах — здесь и в multer-fileFilter (mimetype приходит от клиента).
export const AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// PATCH /api/users/me — сменить отображаемое имя (логин/email/пароль не трогаем). requireAuth.
export async function updateMe(req, res) {
  try {
    let { displayName } = req.body;
    if (typeof displayName !== 'string') {
      return res.status(400).json({ error: 'Укажи имя' });
    }
    displayName = displayName.trim();
    if (!displayName) {
      return res.status(400).json({ error: 'Имя не может быть пустым' });
    }
    if (displayName.length > 50) {
      return res.status(400).json({ error: 'Имя слишком длинное (до 50 символов)' });
    }

    req.user.displayName = displayName;
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  } catch (err) {
    console.error('updateMe error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// POST /api/users/me/avatar — загрузить аватар (multer положил файл в req.file). requireAuth.
// Клиент присылает уже сжатую до 512px картинку. Старый объект из MinIO удаляем.
export async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
    if (!AVATAR_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'Аватар: только PNG, JPEG, WEBP или GIF' });
    }

    const oldKey = req.user.avatarKey;
    const key = `avatars/${req.user.id}-${randomUUID()}`;
    await putObject(key, req.file.buffer, req.file.mimetype);

    req.user.avatarKey = key;
    await req.user.save(); // сперва фиксируем новый ключ — если упадёт, старый аватар цел

    // Старый объект чистим ПОСЛЕ успешного сохранения (иначе при сбое остались бы без аватара).
    if (oldKey && oldKey !== key) {
      await deleteObjects([oldKey]).catch((e) => console.error('avatar cleanup error:', e.message));
    }

    res.status(201).json({ user: publicUser(req.user) });
  } catch (err) {
    console.error('uploadAvatar error:', err);
    res.status(500).json({ error: 'Не удалось загрузить аватар' });
  }
}

// DELETE /api/users/me/avatar — убрать аватар (вернётся кружок с буквой). requireAuth.
export async function removeAvatar(req, res) {
  try {
    const oldKey = req.user.avatarKey;
    if (oldKey) {
      req.user.avatarKey = null;
      await req.user.save();
      await deleteObjects([oldKey]).catch((e) => console.error('avatar cleanup error:', e.message));
    }
    res.json({ user: publicUser(req.user) });
  } catch (err) {
    console.error('removeAvatar error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// GET /api/users/:id/avatar — раздать аватар из приватного MinIO. requireAuth (аватары видят
// только вошедшие — участники звонка/чата). Нет аватара → 404, клиент рисует кружок с буквой.
export async function getAvatar(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(404).end();

    const user = await User.findByPk(id, { attributes: ['id', 'avatarKey'] });
    if (!user || !user.avatarKey) return res.status(404).end();

    const obj = await getObject(user.avatarKey);
    res.setHeader('Content-Type', obj.ContentType || 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Как у вложений: helmet ставит CORP same-origin, из-за чего <img> с другого origin (dev
    // :5173→:4000) не грузится. Разрешаем встраивание — доступ и так за авторизацией (cookie).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Свой аватар клиент бустит версией в URL (?v=), чужие могут отставать до минуты — ок.
    res.setHeader('Cache-Control', 'private, max-age=60');
    if (obj.ContentLength != null) res.setHeader('Content-Length', obj.ContentLength);

    obj.Body.on('error', (e) => {
      console.error('avatar stream error:', e.message);
      res.destroy();
    });
    obj.Body.pipe(res);
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
      return res.status(404).end();
    }
    console.error('getAvatar error:', err);
    if (!res.headersSent) res.status(500).end();
  }
}
