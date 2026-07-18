import { AccessToken } from 'livekit-server-sdk';
import { Room, Message, User } from '../models/index.js';
import { generateRoomCode } from '../utils/roomCode.js';

// Сколько последних сообщений отдаём при входе в комнату. Без лимита комната,
// пожившая пару месяцев, отдавала бы ВСЮ историю одним запросом.
const MESSAGES_LIMIT = 100;

// Приводим комнату к виду для клиента (без служебного updatedAt).
function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    createdBy: room.createdBy,
    createdAt: room.createdAt,
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

// POST /api/rooms — создать новую комнату. Автор — текущий юзер (из requireAuth).
export async function createRoom(req, res) {
  try {
    const code = await generateUniqueCode();
    const room = await Room.create({ code, createdBy: req.user.id });
    res.status(201).json({ room: publicRoom(room) });
  } catch (err) {
    // Наружу — генерик: err.message может содержать детали БД (см. authController).
    console.error('createRoom error:', err);
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
      // подтягиваем автора сразу, чтобы отдать имя вместе с сообщением (один запрос вместо N)
      include: [{ model: User, attributes: ['id', 'displayName'] }],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: MESSAGES_LIMIT,
    });
    messages.reverse();

    // Приводим к чистому виду для клиента
    const result = messages.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      user: { id: m.User.id, displayName: m.User.displayName },
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

    // 2. Собираем токен. identity — кто это (id юзера), name — отображаемое имя.
    // identity стабильна на юзера СОЗНАТЕЛЬНО: LiveKit держит одно соединение на
    // identity, поэтому новый вход в звонок (вторая вкладка/другой девайс) заменяет
    // предыдущий. Это «одно присутствие на аккаунт»: нет эха от двух микрофонов
    // рядом, а при обрыве сети перезаход сразу вытесняет повисшего «призрака».
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: String(req.user.id), // LiveKit ждёт строку
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
    res.json({ token, url: process.env.LIVEKIT_URL });
  } catch (err) {
    console.error('getLivekitToken error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
