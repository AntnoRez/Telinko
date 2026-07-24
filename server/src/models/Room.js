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
    allowNull: false, // id юзера, СОЗДАВШЕГО комнату. Информационно, БЕЗ прав модерации:
    // создать может кто угодно (включая гостя), но модератор — это organizerId, а не создатель.
  },
  organizerId: {
    type: DataTypes.INTEGER,
    allowNull: true, // пусто, пока никто не нажал «Я организатор». Когда проставлен — это
    // МОДЕРАТОР комнаты (user.id того, кто заявился первым), и с этого момента звонок стартовал.
    // Ставится ОДИН раз, перехвата нет (ушёл — модерка остаётся за ним). См. claimOrganizer.
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true, // момент старта звонка = когда назначен организатор (см. claimOrganizer).
    // Одна точка отсчёта на всю комнату → таймер длительности одинаков у всех участников и
    // переживает перезагрузку страницы. Пусто, пока звонок не начался.
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW, // задел на будущее: обновляем при каждом сообщении,
    // потом node-cron по этому полю удалит комнаты без активности > 30 дней
  },
});
// id, createdAt, updatedAt Sequelize добавит сам.
