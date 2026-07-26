import { Op } from 'sequelize';
import { User, Room } from '../models/index.js';
import { getIO } from '../socket/index.js';
import { purgeRoom } from '../utils/roomCleanup.js';

// Сколько минут простоя, прежде чем temp-аккаунт удаляется. По умолчанию 30 (можно задать в .env).
const IDLE_MIN = parseInt(process.env.TEMP_USER_IDLE_MIN || '30', 10);
// Сколько минут комната без активности И без живых сокетов, прежде чем считать её сиротой.
const ROOM_IDLE_MIN = parseInt(process.env.ROOM_IDLE_MIN || '30', 10);
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

// Safety-net для комнат-сирот. Штатно опустевшую комнату сносит сокет (грейс-таймер в памяти
// процесса), но два случая он не ловит:
//   1. Комнату создали (POST /api/rooms), но никто ни разу не открыл /room → room:join не было
//      → грейс-таймер не ставился никогда → комната висит в БД вечно, имя навсегда занято.
//   2. Рестарт сервера: deletionTimers живут в памяти, при рестарте пропадают, а disconnecting
//      по уже отвалившимся сокетам не придёт → все комнаты, активные на момент рестарта, — сироты.
// Ловим оба: комнаты без активности дольше ROOM_IDLE_MIN и БЕЗ живых сокетов сейчас — сносим.
// Активный звонок защищён проверкой сокетов (может идти часами без сообщений → lastActivityAt
// старый, но сокеты на месте).
async function cleanupOrphanRooms() {
  try {
    const cutoff = new Date(Date.now() - ROOM_IDLE_MIN * 60 * 1000);
    const stale = await Room.findAll({ where: { lastActivityAt: { [Op.lt]: cutoff } } });
    if (!stale.length) return;

    const io = getIO();
    let deleted = 0;
    for (const room of stale) {
      // Есть хоть один живой сокет в комнате → кто-то внутри, не трогаем.
      if (io) {
        const sockets = await io.in(room.code).fetchSockets();
        if (sockets.length > 0) continue;
      }
      await purgeRoom(room);
      deleted++;
    }
    if (deleted) console.log(`cleanup: удалено комнат-сирот: ${deleted}`);
  } catch (err) {
    console.error('room cleanup error:', err.message);
  }
}

// Один прогон чистки: temp-аккаунты + комнаты-сироты.
async function runCleanup() {
  await cleanupTempUsers();
  await cleanupOrphanRooms();
}

// Запускаем периодическую чистку. Без внешних зависимостей — обычный setInterval.
// (node-cron не тянем: интервальной чистки «раз в N минут» хватает с запасом.)
export function startCleanupJob() {
  setInterval(runCleanup, RUN_EVERY_MS);
  setTimeout(runCleanup, 30 * 1000); // первый прогон через 30с после старта
}
