import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

// Секрет для одноразовой передачи. Сервер хранит ТОЛЬКО шифротекст — сам plaintext,
// ключ и пароль он никогда не видит (шифрование в браузере, ключ живёт в URL после #).
export const Secret = sequelize.define('Secret', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    // Случайный неугадываемый id (НЕ автоинкремент — иначе секреты перебирались бы
    // по /secret/1, /secret/2...). Генерим в utils/secretId.js.
  },
  ciphertext: {
    type: DataTypes.TEXT, // AES-GCM шифроблоб (base64), может быть длинным → TEXT, не STRING
    allowNull: false,
  },
  iv: {
    type: DataTypes.STRING, // вектор инициализации AES-GCM (НЕ секрет)
    allowNull: false,
  },
  salt: {
    type: DataTypes.STRING, // соль для PBKDF2 (НЕ секрет)
    allowNull: false,
  },
  hasPassword: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false, // был ли добавлен пароль поверх ключа из URL
  },
  burnAfterRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true, // удалить после первого прочтения
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true, // срок жизни; null = бессрочно
  },
});
// createdAt, updatedAt Sequelize добавит сам. Свой строковый id — автоинкремент отключён.
