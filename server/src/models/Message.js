import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

// Одно сообщение чата в комнате.
export const Message = sequelize.define('Message', {
  roomId: {
    type: DataTypes.INTEGER,
    allowNull: false, // в какой комнате написано
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true, // автор. NULLABLE + ON DELETE SET NULL (см. models/index.js): temp-юзеры
    // удаляются по простою, но их сообщения в ещё живой комнате должны оставаться.
  },
  authorName: {
    type: DataTypes.STRING,
    allowNull: true, // СНИМОК имени автора на момент отправки. Нужен, чтобы показать имя даже
    // после удаления автора (userId стал null). Проставляется всегда при создании сообщения.
  },
  text: {
    type: DataTypes.TEXT, // TEXT (а не STRING) — без ограничения длины, сообщение может быть длинным
    allowNull: true, // может быть пустым, если сообщение — только вложение (фото/файл)
  },
  // --- Вложение (одно на сообщение). null во всех полях = обычное текстовое сообщение. ---
  attachmentKey: {
    type: DataTypes.STRING,
    allowNull: true, // ключ объекта в MinIO (rooms/<code>/<uuid>-<name>). НАРУЖУ не отдаём.
  },
  attachmentType: {
    type: DataTypes.STRING,
    allowNull: true, // mime (image/png, video/mp4, application/pdf…) — по нему клиент решает, как рендерить
  },
  attachmentName: {
    type: DataTypes.STRING,
    allowNull: true, // исходное имя файла (для подписи/скачивания)
  },
  attachmentSize: {
    type: DataTypes.INTEGER,
    allowNull: true, // размер в байтах (для подписи)
  },
});
// id, createdAt, updatedAt Sequelize добавит сам. createdAt = время отправки.
