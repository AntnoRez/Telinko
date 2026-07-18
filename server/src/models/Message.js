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
    allowNull: false, // кто автор
  },
  text: {
    type: DataTypes.TEXT, // TEXT (а не STRING) — без ограничения длины, сообщение может быть длинным
    allowNull: false,
  },
});
// id, createdAt, updatedAt Sequelize добавит сам. createdAt = время отправки.
