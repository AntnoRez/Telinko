// Какое событие какую функцию выполняет
import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { User, Room, Message } from '../models/index.js';

// Лимиты на сообщения. REST-тело ограничено в app.js (150kb), но сокет — отдельная
// дверь, и без своих лимитов через неё пролезало бы до 1 МБ (дефолт socket.io).
const MAX_MESSAGE_LENGTH = 5000; // символов; больше — молча отбрасываем
const FLOOD_WINDOW_MS = 10_000; // окно антифлуда
const FLOOD_MAX_MESSAGES = 15; // максимум сообщений с одного сокета за окно

// Сколько комната живёт ПУСТОЙ, прежде чем удалиться. Грейс-период нужен, чтобы
// обновление страницы (F5) и короткий обрыв сети не убивали комнату: при рефреше сокет
// на секунду отключается и тут же переподключается. Удаляли бы мгновенно — комната
// исчезала бы на каждом одиночном рефреше. Переподключение отменяет запланированное удаление.
const ROOM_EMPTY_TTL_MS = 60_000;

// Разбираем строку заголовка Cookie ("token=abc; other=xyz") в объект { token: 'abc', ... }.
// Своя мини-функция, потому что у сокета нет cookie-parser, как у Express.
function parseCookie(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// Поднимает socket.io поверх http-сервера и настраивает авторизацию + события чата.
export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN, // тот же фронт, что и для REST
      credentials: true, // разрешаем cookie при подключении сокета
    },
    // Потолок на размер ЛЮБОГО входящего пакета (дефолт — 1 МБ). Наши события —
    // это код комнаты и текст сообщения; 32 КБ хватает с запасом, а мусор больше
    // socket.io отбросит сам, ещё до наших обработчиков.
    maxHttpBufferSize: 32 * 1024,
  });

  // --- Авторизация соединения ---
  // io.use — middleware, срабатывает ОДИН раз при подключении сокета (аналог requireAuth).
  // Если вызвать next(error) — соединение отклоняется.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie);
      const token = cookies.token; // та же httpOnly cookie, что и в REST
      if (!token) return next(new Error('Не авторизован'));

      const payload = verifyToken(token); // битый/протухший → бросит → catch
      const user = await User.findByPk(payload.userId);
      if (!user) return next(new Error('Не авторизован'));

      // Запоминаем, кто на этом сокете — пригодится в событиях (socket.data живёт всё соединение).
      socket.data.userId = user.id;
      socket.data.displayName = user.displayName;
      next();
    } catch {
      next(new Error('Не авторизован'));
    }
  });

  // Собрать список участников комнаты и разослать его ВСЕЙ комнате.
  // Источник правды — сами комнаты socket.io: спрашиваем, какие сокеты сейчас в code.
  // excludeId — сокет, которого надо исключить (при disconnecting он ещё числится в комнате).
  async function broadcastPresence(code, excludeId = null) {
    const sockets = await io.in(code).fetchSockets();

    // Дедуп по userId: у юзера может быть несколько вкладок — в списке он один раз.
    const byUser = new Map();
    for (const s of sockets) {
      if (s.id === excludeId) continue; // уходящий сокет не считаем
      byUser.set(s.data.userId, {
        userId: s.data.userId,
        displayName: s.data.displayName,
      });
    }

    io.to(code).emit('presence:update', {
      code,
      participants: [...byUser.values()],
    });

    // Возвращаем число оставшихся УНИКАЛЬНЫХ участников — вызывающий (disconnecting)
    // по нему решает, не пора ли планировать удаление опустевшей комнаты.
    return byUser.size;
  }

  // --- Удаление опустевших комнат ---
  // code -> таймер отложенного удаления. Живёт в памяти процесса (переживать рестарт
  // и не должно: после рестарта все сокеты отваливаются, а брошенные комнаты подберёт
  // будущая cron-чистка по lastActivityAt).
  const deletionTimers = new Map();

  // Запланировать удаление комнаты через грейс-период. Если удаление уже запланировано —
  // не дублируем таймер.
  function scheduleRoomCleanup(code) {
    if (deletionTimers.has(code)) return;
    const timer = setTimeout(async () => {
      deletionTimers.delete(code);
      try {
        // Перепроверяем: за грейс-период кто-то мог зайти (рефреш/переподключение/новый гость).
        const sockets = await io.in(code).fetchSockets();
        if (sockets.length > 0) return; // снова не пусто — комнату оставляем

        // Пусто — удаляем комнату и её сообщения. Явно чистим сообщения, не полагаясь на
        // FK-каскад: так удаление предсказуемо независимо от того, как создавалась схема.
        const room = await Room.findOne({ where: { code } });
        if (!room) return; // уже удалена
        await Message.destroy({ where: { roomId: room.id } });
        await room.destroy();
      } catch (err) {
        console.error('room cleanup error:', err.message);
      }
    }, ROOM_EMPTY_TTL_MS);
    deletionTimers.set(code, timer);
  }

  // Отменить запланированное удаление (кто-то вошёл в комнату раньше срока).
  function cancelRoomCleanup(code) {
    const timer = deletionTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      deletionTimers.delete(code);
    }
  }

  // --- События уже авторизованного сокета ---
  io.on('connection', (socket) => {
    // Времена последних сообщений этого сокета — для антифлуда (см. message:send).
    socket.data.msgTimes = [];

    // Войти в комнату по коду. socket.join кладёт сокет в "комнату" socket.io —
    // дальше io.to(code) будет слать всем, кто join'нулся под этим кодом.
    socket.on('room:join', async (code) => {
      // Код обязан быть короткой строкой И существовать в БД — иначе любой клиент
      // мог бы плодить в памяти socket.io комнаты с произвольными именами.
      if (typeof code !== 'string' || code.length > 32) return;
      const room = await Room.findOne({ where: { code } });
      if (!room) return;

      socket.join(code); // добавиться в комнату
      cancelRoomCleanup(code); // кто-то вошёл — отменяем отложенное удаление, если было
      await broadcastPresence(code); // разослать обновлённый состав всем в комнате
    });

    // Прислали сообщение: { code, text }.
    socket.on('message:send', async (data) => {
      try {
        // Валидация входа: клиенту мы не доверяем, даже авторизованному.
        // Кривой payload (не объект, не строки, слишком длинно) — молча отбрасываем.
        if (!data || typeof data !== 'object') return;
        const { code, text } = data;
        if (typeof code !== 'string' || typeof text !== 'string') return;
        if (!text.trim()) return; // пустое не сохраняем
        if (text.length > MAX_MESSAGE_LENGTH) return;

        // Антифлуд: не больше FLOOD_MAX_MESSAGES за FLOOD_WINDOW_MS с одного сокета.
        // Оставляем в списке только «свежие» отметки времени и смотрим, сколько их.
        const now = Date.now();
        socket.data.msgTimes = socket.data.msgTimes.filter((t) => now - t < FLOOD_WINDOW_MS);
        if (socket.data.msgTimes.length >= FLOOD_MAX_MESSAGES) return;
        socket.data.msgTimes.push(now);

        const room = await Room.findOne({ where: { code } });
        if (!room) return; // нет такой комнаты — игнорируем

        // 1. сохраняем в БД
        const message = await Message.create({
          roomId: room.id,
          userId: socket.data.userId,
          text: text.trim(),
        });

        // 2. отмечаем активность комнаты (задел под чистку node-cron)
        room.lastActivityAt = new Date();
        await room.save();

        // 3. рассылаем ВСЕМ в комнате (включая отправителя) — в том же виде, что REST-история
        io.to(code).emit('message:new', {
          id: message.id,
          text: message.text,
          createdAt: message.createdAt,
          user: { id: socket.data.userId, displayName: socket.data.displayName },
        });
      } catch (err) {
        console.error('message:send error:', err.message);
      }
    });

    // 'disconnecting' срабатывает, пока сокет ЕЩЁ в своих комнатах —
    // тут мы знаем, откуда он уходит. В 'disconnect' он уже вышел и комнат не знает.
    socket.on('disconnecting', () => {
      // socket.rooms содержит и личную комнату сокета (== socket.id) — её пропускаем.
      for (const code of socket.rooms) {
        if (code === socket.id) continue;
        // Пересчитываем состав БЕЗ уходящего сокета и шлём оставшимся. Если не осталось
        // никого — планируем удаление комнаты (с грейс-периодом, см. scheduleRoomCleanup).
        broadcastPresence(code, socket.id).then((remaining) => {
          if (remaining === 0) scheduleRoomCleanup(code);
        });
      }
    });
  });

  return io;
}
