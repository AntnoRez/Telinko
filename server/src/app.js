import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roomRoutes from './routes/rooms.js';
import secretRoutes from './routes/secrets.js';

// Здесь ТОЛЬКО создаём и настраиваем Express-приложение и отдаём его наружу.
// Никакого app.listen и коннекта к БД — это делает index.js.
// Благодаря такому разделению тесты могут импортировать app и слать в него
// запросы, не поднимая реальный сервер и не занимая порт.
const app = express();

// На проде Express стоит за nginx и видит все соединения от 127.0.0.1.
// trust proxy = 1 говорит: реальный IP клиента бери из заголовка X-Forwarded-For,
// который ставит nginx. БЕЗ этого rate-limit считал бы всех посетителей одним IP
// и банил бы всех разом. В локалке (без прокси) настройка безвредна.
app.set('trust proxy', 1);

// Middleware
app.use(helmet()); // набор защитных HTTP-заголовков (nosniff, скрытие X-Powered-By и т.д.)
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, // пускаем запросы только с адреса фронта
    credentials: true, // разрешаем браузеру слать/принимать cookie (для httpOnly токена)
  })
);
// limit 150kb: шифроблоб секрета до 100 КБ + служебные поля должны влезать в тело
// (иначе express отбил бы запрос своим дефолтным лимитом 100kb раньше нашей проверки).
app.use(express.json({ limit: '150kb' })); // парсит JSON-тело запросов в req.body
app.use(cookieParser()); // наполняет req.cookies — без него middleware не увидит токен

// Проверочный роут: фронт дёрнет его, чтобы убедиться, что сервер жив
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Роуты авторизации: все пути внутри получат префикс /api/auth
app.use('/api/auth', authRoutes);

// Роуты профиля: префикс /api/users (сменить имя/аватар, раздача аватаров)
app.use('/api/users', userRoutes);

// Роуты комнат: префикс /api/rooms
app.use('/api/rooms', roomRoutes);

// Роуты секретных ссылок: префикс /api/secrets (публичные)
app.use('/api/secrets', secretRoutes);

// Неизвестный путь — отдаём JSON 404 (а не дефолтную HTML-страницу Express).
app.use((req, res) => {
  res.status(404).json({ error: 'Не найдено' });
});

// Глобальный обработчик ошибок (4 аргумента — Express распознаёт его как error-handler).
// Главный кейс: битый JSON в теле (express.json бросает) — без этого клиент получил бы HTML-500
// вместо JSON. Детали ошибки остаются в логе, наружу — генерик (AP1).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
  }
  console.error('unhandled error:', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

export default app;
