import { Op } from 'sequelize';
import { Message } from '../models/index.js';
import { deleteObjects } from '../config/s3.js';

// Полностью снести комнату: сперва файлы вложений из MinIO (иначе объекты осиротеют),
// затем сообщения, затем саму комнату. Сообщения чистим ЯВНО, не полагаясь на FK-каскад —
// так удаление предсказуемо независимо от того, как создавалась схема.
// Общий хелпер: используют и сокет (грейс-удаление опустевшей комнаты), и cron-safety-net
// (комнаты-сироты — не открытые ни разу либо пережившие рестарт сервера).
export async function purgeRoom(room) {
  const withFiles = await Message.findAll({
    where: { roomId: room.id, attachmentKey: { [Op.ne]: null } },
    attributes: ['attachmentKey'],
  });
  if (withFiles.length) {
    await deleteObjects(withFiles.map((m) => m.attachmentKey)).catch((e) =>
      console.error('attachment cleanup error:', e.message)
    );
  }
  await Message.destroy({ where: { roomId: room.id } });
  await room.destroy();
}
