import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

// Модель пользователя — описывает таблицу users в БД.
// Здесь ТОЛЬКО схема (какие поля и правила). Хеширование пароля делаем
// в контроллере при регистрации, чтобы логика была на виду, а не «магией» внутри модели.
export const User = sequelize.define('User', {
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true, // два юзера с одним email невозможны — БД не даст
    validate: {
      isEmail: true, // Sequelize проверит формат до записи в БД
    },
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false, // храним ТОЛЬКО хеш, никогда не сам пароль
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false, // имя для отображения в чатах/звонках
  },
});
// Sequelize сам добавит поля id, createdAt, updatedAt.
