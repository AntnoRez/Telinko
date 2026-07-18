import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

// Комната-встреча. По полю code в неё заходят (как ссылка в Телемосте).
export const Room = sequelize.define('Room', {
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true, // код комнаты уникален — по нему находим комнату
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false, // id юзера, создавшего комнату
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW, // задел на будущее: обновляем при каждом сообщении,
    // потом node-cron по этому полю удалит комнаты без активности > 30 дней
  },
});
// id, createdAt, updatedAt Sequelize добавит сам.
