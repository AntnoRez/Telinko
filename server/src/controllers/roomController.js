import crypto from 'crypto';
import { AccessToken } from 'livekit-server-sdk';
import { Room, Message } from '../models/index.js';
import { generateRoomCode } from '../utils/roomCode.js';
import { getIO } from '../socket/index.js';

// Сколько последних сообщений отдаём при входе в комнату. Без лимита комната,
// пожившая пару месяцев, отдавала бы ВСЮ историю одним запросом.
const MESSAGES_LIMIT = 100;

// Разрешённый формат КАСТОМНОГО имени комнаты (когда юзер задаёт своё вместо авто-кода).
// Идёт в путь URL (/room/:code) → без пробелов и спецсимволов: начинается с буквы/цифры, дальше
// буквы/цифры/дефис/подчёркивание, длина 2..64. Регистр СОХРАНЯЕМ — из него клиент выводит
// отображаемое имя разбивкой по CamelCase (FggaGgHh → «Fgga Gg Hh»).
const CUSTOM_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

// Приводим комнату к виду для клиента (без служебного updatedAt).
function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    createdBy: room.createdBy, // кто создал (информационно, БЕЗ прав модерации)
    createdAt: room.createdAt,
    organizerId: room.organizerId, // модератор (или null, если звонок ещё не стартовал)
    started: room.organizerId !== null, // звонок начался, когда назначен организатор
    startedAt: room.startedAt, // точка отсчёта таймера длительности (null, пока не начался)
  };
}

// Генерируем код и проверяем, что он свободен. Практически всегда с первой попытки,
// но на случай коллизии — несколько попыток.
async function generateUniqueCode() {
  for (let i = 0; i < 5; i++) {
    const code = generateRoomCode();
    const existing = await Room.findOne({ where: { code } });
    if (!existing) return code;
  }
  throw new Error('Не удалось подобрать свободный код комнаты');
}

// POST /api/rooms — создать новую комнату. Создатель (createdBy) — текущий юзер (из requireAuth),
// им может быть и гость: создавать комнаты можно всем, модератором создатель НЕ становится
// (модератор = organizerId, назначается позже через «Я организатор»).
// body.code (опц.) — своё имя комнаты; не задано → генерим короткий авто-код.
export async function createRoom(req, res) {
  try {
    let code;
    const raw = req.body?.code;
    if (typeof raw === 'string' && raw.trim()) {
      // Юзер задал имя комнаты — оно и есть code.
      code = raw.trim();
      if (!CUSTOM_CODE_RE.test(code)) {
        return res.status(400).json({
          error: 'Имя комнаты: латиница/цифры/дефис/подчёркивание, 2–64 символа, без пробелов',
        });
      }
      const existing = await Room.findOne({ where: { code } });
      if (existing) {
        return res.status(409).json({ error: 'Комната с таким именем уже занята' });
      }
    } else {
      // Имя не задано — короткий авто-код (abc-d2f).
      code = await generateUniqueCode();
    }

    const room = await Room.create({ code, createdBy: req.user.id });
    res.status(201).json({ room: publicRoom(room) });
  } catch (err) {
    // Гонка: двое одновременно заняли одно кастомное имя — второму уникальный индекс не даст.
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Комната с таким именем уже занята' });
    }
    // Наружу — генерик: err.message может содержать детали БД (см. authController).
    console.error('createRoom error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// POST /api/rooms/:code/claim-organizer — «Я организатор»: заявиться модератором комнаты.
// Только реальный аккаунт (гость — нельзя, для этого он и логинится). Первый заявившийся
// становится организатором НАВСЕГДА; с этого момента звонок стартует — сокет call:started
// пускает ждавших внутрь. Повторные вызовы власть НЕ перехватывают (модель C) — просто
// возвращаем текущего организатора.
export async function claimOrganizer(req, res) {
  try {
    if (req.user.guest) {
      return res.status(403).json({ error: 'Гость не может стать организатором. Войдите в аккаунт.' });
    }

    const room = await Room.findOne({ where: { code: req.params.code } });
    if (!room) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }

    if (room.organizerId === null) {
      room.organizerId = req.user.id;
      room.startedAt = new Date(); // старт звонка — точка отсчёта таймера длительности
      await room.save();
      // Пускаем ждавших: у кого открыт экран ожидания — по этому событию запросят токен и войдут.
      getIO()?.to(room.code).emit('call:started', { code: room.code });
    }

    res.json({ organizerId: room.organizerId, started: true });
  } catch (err) {
    console.error('claimOrganizer error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// GET /api/rooms/:code — найти комнату по коду (фронт проверяет, что код существует, перед входом).
export async function getRoom(req, res) {
  try {
    const room = await Room.findOne({ where: { code: req.params.code } });
    if (!room) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }
    res.json({ room: publicRoom(room) });
  } catch (err) {
    console.error('getRoom error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// GET /api/rooms/:code/messages — история сообщений комнаты (грузим один раз при входе).
export async function getMessages(req, res) {
  try {
    const room = await Room.findOne({ where: { code: req.params.code } });
    if (!room) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }

    // Берём ПОСЛЕДНИЕ N сообщений: сортируем от новых к старым и режем лимитом,
    // потом разворачиваем обратно — клиент ждёт порядок «от старых к новым».
    // id в сортировке — на случай одинаковых createdAt (сообщения в одну миллисекунду).
    const messages = await Message.findAll({
      where: { roomId: room.id },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: MESSAGES_LIMIT,
    });
    messages.reverse();

    // Приводим к чистому виду для клиента. Имя берём из снимка authorName — переживает удаление
    // автора (temp-юзера почистил cron → userId стал null, но имя осталось).
    const result = messages.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      user: { id: m.userId, displayName: m.authorName || 'Гость' },
      // key наружу не отдаём — клиент строит ссылку раздачи по id сообщения.
      attachment: m.attachmentKey
        ? { type: m.attachmentType, name: m.attachmentName, size: m.attachmentSize }
        : null,
    }));

    res.json({ messages: result });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// POST /api/rooms/:code/livekit-token — выдать текущему юзеру токен для входа в видеозвонок.
// Токен подписан нашим ключом+секретом; LiveKit-сервер проверит подпись и пустит в комнату.
export async function getLivekitToken(req, res) {
  try {
    // 1. Комната должна существовать (не выдаём токены в несуществующие комнаты).
    const room = await Room.findOne({ where: { code: req.params.code } });
    if (!room) {
      return res.status(404).json({ error: 'Комната не найдена' });
    }

    // 1.5. Звонок ещё не начался (никто не заявился организатором) → токен НЕ выдаём: клиент
    //      показывает экран ожидания и войдёт, когда придёт сокет-событие call:started.
    if (room.organizerId === null) {
      return res.json({ started: false });
    }

    // 2. Собираем токен. identity — кто это, name — отображаемое имя.
    // LiveKit держит ОДНО соединение на identity: второй вход с тем же identity
    // вышибает первый. Чтобы в один звонок можно было зайти с РАЗНЫХ устройств одного
    // аккаунта, добавляем к userId суффикс устройства — у каждого устройства свой
    // identity, они сосуществуют. deviceId приходит от клиента (sessionStorage) и
    // стабилен в пределах вкладки/устройства, поэтому перезаход с ТОГО ЖЕ устройства
    // вытесняет своего же «призрака» (не плодит их). Значение клиента не доверяем:
    // чистим до безопасного набора и режем длину; userId-префикс берём из токена, так
    // что подделать чужую identity нельзя (максимум столкнёшься со своим устройством).
    const rawDevice = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    const deviceId = rawDevice.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || crypto.randomUUID();

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: `${req.user.id}__${deviceId}`, // userId + устройство → уникально на устройство
        name: req.user.displayName,
      }
    );

    // 3. Права: войти именно в ЭТУ комнату (room=code), публиковать свои камеру/микрофон
    //    и подписываться на чужие потоки.
    at.addGrant({
      roomJoin: true,
      room: room.code,
      canPublish: true,
      canSubscribe: true,
    });

    // 4. toJwt() асинхронный — без await в токен уйдёт Promise, и LiveKit его отвергнет.
    const token = await at.toJwt();

    // url отдаём вместе с токеном, чтобы фронт знал, куда подключаться.
    // started:true — звонок идёт (парный признак к ветке «1.5» выше, где started:false).
    res.json({ started: true, token, url: process.env.LIVEKIT_URL });
  } catch (err) {
    console.error('getLivekitToken error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
