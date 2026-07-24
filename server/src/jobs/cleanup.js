import { Op } from 'sequelize';
import { User } from '../models/index.js';
import { getIO } from '../socket/index.js';

// Сколько минут простоя, прежде чем temp-аккаунт удаляется. По умолчанию 30 (можно задать в .env).
const IDLE_MIN = parseInt(process.env.TEMP_USER_IDLE_MIN || '30', 10);
const RUN_EVERY_MS = 10 * 60 * 1000; // прогон раз в 10 минут

// Удаляет temp-аккаунты (гость / одноклик с галочкой «удалить после сессий»), которые давно
// не в сети. Защита от удаления АКТИВНОГО: исключаем всех, кто СЕЙЧАС держит сокет (даже если
// lastSeenAt старый — например, сидит в звонке часами). Сообщения удалённых не пропадают:
// userId → null (ON DELETE SET NULL), имя остаётся в Message.authorName.
async function cleanupTempUsers() {
  try {
    const cutoff = new Date(Date.now() - IDLE_MIN * 60 * 1000);

    // id всех, кто сейчас онлайн (по активным сокетам) — их не трогаем.
    let onlineIds = [];
    const io = getIO();
    if (io) {
      const sockets = await io.fetchSockets();
      onlineIds = [...new Set(sockets.map((s) => s.data.userId).filter((id) => id != null))];
    }

    const where = { temporary: true, lastSeenAt: { [Op.lt]: cutoff } };
    if (onlineIds.length) where.id = { [Op.notIn]: onlineIds };

    const deleted = await User.destroy({ where });
    if (deleted) console.log(`cleanup: удалено temp-аккаунтов: ${deleted}`);
  } catch (err) {
    console.error('cleanup error:', err.message);
  }
}

// Запускаем периодическую чистку. Без внешних зависимостей — обычный setInterval.
// (node-cron не тянем: интервальной чистки «раз в N минут» хватает с запасом.)
export function startCleanupJob() {
  setInterval(cleanupTempUsers, RUN_EVERY_MS);
  setTimeout(cleanupTempUsers, 30 * 1000); // первый прогон через 30с после старта
}
