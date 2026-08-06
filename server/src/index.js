import 'dotenv/config'; // загружает переменные из .env в process.env (должно быть первым)
import http from 'http';

import app from './app.js';
import { connectDB } from './config/db.js';
import { syncModels } from './models/index.js';
import { initSocket } from './socket/index.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { assertChatKey } from './utils/chatCrypto.js';

const PORT = process.env.PORT || 4000;

// Без валидного CHAT_ENC_KEY чат нельзя шифровать — падаем сразу, а не пишем плейнтекст в БД.
assertChatKey();

// Без JWT_SECRET авторизация молча сломается (verifyToken/ signToken упадут на первом же запросе,
// а не на старте). Падаем громко здесь, симметрично assertChatKey (U2).
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET не задан — авторизация работать не будет. Заполни server/.env');
  process.exit(1);
}

// Создаём http-сервер вручную из Express-приложения.
// Раньше это делал app.listen неявно; теперь нам нужен сам сервер,
// чтобы прицепить к нему socket.io (он работает поверх того же http-сервера).
const server = http.createServer(app);
initSocket(server); // поднимаем socket.io на этом же сервере

// Сначала убеждаемся, что БД доступна и таблицы на месте, и только потом поднимаем сервер.
async function start() {
  try {
    await connectDB();
    console.log('БД подключена');

    await syncModels(); // создаёт таблицы по моделям, если их ещё нет
    console.log('Модели синхронизированы');

    startCleanupJob(); // периодическая чистка протухших temp-аккаунтов

    // Слушаем на server (не app!) — чтобы работали и REST, и socket.io.
    server.listen(PORT, () => {
      console.log(`Сервер слушает http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Не удалось запуститься:', err.message);
    process.exit(1); // нет смысла работать без БД — падаем явно
  }
}

start();
