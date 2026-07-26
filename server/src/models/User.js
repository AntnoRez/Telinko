import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

// Модель пользователя — описывает таблицу users в БД.
// Здесь ТОЛЬКО схема (какие поля и правила). Хеширование пароля делаем
// в контроллере при регистрации, чтобы логика была на виду, а не «магией» внутри модели.
export const User = sequelize.define('User', {
  email: {
    type: DataTypes.STRING,
    allowNull: true, // у ГОСТЕЙ email нет (null). В Postgres несколько NULL в unique-колонке
    // разрешены, поэтому гости не конфликтуют между собой. Валидатор isEmail на null
    // не срабатывает (Sequelize пропускает валидацию, когда allowNull и значение null).
    unique: true, // среди РЕАЛЬНЫХ аккаунтов email уникален — БД не даст двух одинаковых
    validate: {
      isEmail: true, // формат проверяем только у непустого email (реальные аккаунты)
    },
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: true, // у гостей пароля нет (null): войти под гостем нельзя, это чистая сессия
  },
  githubId: {
    type: DataTypes.STRING,
    allowNull: true, // заполнен только у аккаунтов, вошедших через GitHub. По нему ищем/создаём
    // юзера при OAuth-входе (см. githubAuthController). У остальных — null.
    unique: true, // один GitHub-аккаунт = один наш аккаунт. В Postgres несколько NULL в unique
    // разрешены → обычные email-аккаунты и гости (githubId=null) не конфликтуют.
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false, // имя для отображения в чатах/звонках — есть у всех, включая гостей
  },
  avatarKey: {
    type: DataTypes.STRING,
    allowNull: true, // ключ объекта аватара в MinIO (avatars/<id>-<uuid>). null = аватара нет,
    // показываем кружок с буквой. НАРУЖУ не отдаём — раздаём через GET /api/users/:id/avatar.
  },
  // --- Гостевой режим / модерация ---
  guest: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false, // true = зашёл гостем по имени. Гость МОЖЕТ создавать комнаты и заходить,
    // но НЕ может стать организатором (нажать «Я организатор» — для этого нужен реальный аккаунт).
    // Модерация определяется НЕ этим флагом, а тем, организатор ли ты комнаты
    // (user.id === room.organizerId). См. guest-mode-plan.md.
  },
  temporary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false, // true = временный аккаунт: удаляется по простою (cron, Фаза 5).
    // Гости всегда temporary; одноклик-организатор — temporary по галочке «удалить после сессий».
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW, // обновляем при активности (сокет-коннект); по нему cron решает «протух».
  },
});
// Sequelize сам добавит поля id, createdAt, updatedAt.
