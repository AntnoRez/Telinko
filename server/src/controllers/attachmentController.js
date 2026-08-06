import { randomUUID } from 'crypto';
import { Room, Message } from '../models/index.js';
import { putObject, getObject } from '../config/s3.js';
import { decryptText } from '../utils/chatCrypto.js';

// Типы, которые безопасно показывать ВСТРОЕННО (inline) с нашего домена. Всё прочее (html, svg,
// exe, doc…) отдаём как вложение (attachment) + nosniff — иначе inline-html/svg с нашего origin
// исполнился бы как страница нашего сайта = XSS. SVG намеренно НЕ inline (может нести скрипт).
const INLINE_IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
function isInline(type) {
  const t = type || '';
  return INLINE_IMAGE.has(t) || t === 'application/pdf' || t.startsWith('video/') || t.startsWith('audio/');
}

// Имя файла → безопасный кусок для ключа объекта (латиница/цифры/._-, прочее → _).
function safeKeyName(name) {
  const base = (name || 'file').split(/[\\/]/).pop(); // отрезаем пути
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 100) || 'file';
}

// POST /api/rooms/:code/attachments — принять файл и положить в MinIO. requireAuth + multer выше.
// Возвращает метаданные (включая key) — клиент вернёт их в сокете message:send.
export async function uploadAttachment(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' });

    const room = await Room.findOne({ where: { code: req.params.code } });
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    // multer/busboy отдаёт имя файла в latin1 (binary) — UTF-8 (кириллица) приходит «кракозябрами».
    // Перекодируем обратно в UTF-8. Для ASCII-имён это no-op.
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const key = `rooms/${req.params.code}/${randomUUID()}-${safeKeyName(originalName)}`;
    await putObject(key, req.file.buffer, req.file.mimetype);

    res.status(201).json({
      key,
      type: req.file.mimetype,
      name: originalName,
      size: req.file.size,
    });
  } catch (err) {
    console.error('uploadAttachment error:', err);
    res.status(500).json({ error: 'Не удалось загрузить файл' });
  }
}

// GET /api/rooms/:code/attachments/:messageId — стримим файл из MinIO. requireAuth выше.
// MinIO приватный (localhost) — раздаём только через этот авторизованный эндпоинт.
export async function downloadAttachment(req, res) {
  try {
    const room = await Room.findOne({ where: { code: req.params.code } });
    if (!room) return res.status(404).end();

    const message = await Message.findByPk(req.params.messageId);
    if (!message || message.roomId !== room.id || !message.attachmentKey) {
      return res.status(404).end();
    }

    const range = req.headers.range; // "bytes=..." при перемотке видео
    const obj = await getObject(message.attachmentKey, range);

    const type = message.attachmentType || obj.ContentType || 'application/octet-stream';
    const disposition = isInline(type) ? 'inline' : 'attachment';
    // attachmentName в БД зашифровано (at-rest) → расшифровываем для заголовка/скачивания.
    const filename = encodeURIComponent(decryptText(message.attachmentName) || 'file');

    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // helmet по умолчанию ставит CORP: same-origin, из-за чего <img>/<video> с другого origin
    // (в деве фронт :5173, API :4000) не грузятся. Разрешаем встраивание — доступ и так за
    // авторизацией (cookie). На проде (один origin через nginx) это ни на что не влияет.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${filename}`);
    if (obj.ContentLength != null) res.setHeader('Content-Length', obj.ContentLength);
    if (range && obj.ContentRange) {
      res.status(206); // частичный контент (перемотка)
      res.setHeader('Content-Range', obj.ContentRange);
    }

    obj.Body.on('error', (e) => {
      console.error('attachment stream error:', e.message);
      res.destroy();
    });
    // Клиент оборвал (закрыл вкладку, мотает видео Range-запросами) → гасим поток из MinIO, иначе
    // соединение из пула висит до таймаута (AT1). destroy() на уже дочитанном потоке безопасен.
    res.on('close', () => obj.Body.destroy());
    obj.Body.pipe(res);
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
      return res.status(404).end();
    }
    console.error('downloadAttachment error:', err);
    if (!res.headersSent) res.status(500).end();
  }
}
