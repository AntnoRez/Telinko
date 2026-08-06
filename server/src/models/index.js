import { sequelize } from '../config/db.js';
import { User } from './User.js';
import { Room } from './Room.js';
import { Message } from './Message.js';
import { Secret } from './Secret.js';

// Единая точка сбора всех моделей И связей между ними.

// --- Связи ---
// Комната содержит много сообщений; у сообщения одна комната.
Room.hasMany(Message, { foreignKey: 'roomId', onDelete: 'CASCADE' });
Message.belongsTo(Room, { foreignKey: 'roomId' });

// Юзер написал много сообщений; у сообщения один автор.
// onDelete: 'SET NULL' — удаляем temp-юзера по простою → его сообщения НЕ удаляются, а теряют
// автора (userId → null). Имя при этом сохранится в Message.authorName (снимок). Требует
// Message.userId nullable (см. Message.js).
User.hasMany(Message, { foreignKey: 'userId', onDelete: 'SET NULL' });
Message.belongsTo(User, { foreignKey: 'userId' });

// onDelete: 'CASCADE' у Room→Message означает: удалим комнату — её сообщения
// удалятся автоматически (пригодится, когда node-cron начнёт чистить мёртвые комнаты).

// Secret — отдельный инструмент (передача секретов), ни с кем не связан: секреты
// анонимны и не привязаны к юзеру. Просто регистрируем модель, чтобы sync создал таблицу.

// Создаёт таблицы в БД по описанию моделей, если их ещё нет.
// По умолчанию — безопасный sync(): создаёт недостающие таблицы, но НЕ трогает существующие
// (новые колонки/индексы на старой БД не появятся).
// Когда меняли схему (добавили колонку/индекс) — разово запустить с DB_ALTER=true: sync({alter:true})
// приведёт существующую БД к моделям. На проде запускать осознанно (alter может менять/пересоздавать
// колонки и индексы) — схемой прода управляет владелец сервера вручную. Миграций сознательно нет.
export async function syncModels() {
  const alter = process.env.DB_ALTER === 'true';
  await sequelize.sync(alter ? { alter: true } : undefined);
}

export { User, Room, Message, Secret };
