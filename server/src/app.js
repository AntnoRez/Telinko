import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import secretRoutes from './routes/secrets.js';

// Здесь ТОЛЬКО создаём и настраиваем Express-приложение и отдаём его наружу.
// Никакого app.listen и коннекта к БД — это делает index.js.
// Благодаря такому разделению тесты могут импортировать app и слать в него
// запросы, не поднимая реальный сервер и не занимая порт.
const app = express();

// Middleware
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

// Роуты комнат: префикс /api/rooms
app.use('/api/rooms', roomRoutes);

// Роуты секретных ссылок: префикс /api/secrets (публичные)
app.use('/api/secrets', secretRoutes);

export default app;
