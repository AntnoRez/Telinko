import {
  RoomServiceClient,
  DataPacket_Kind,
  TrackSource,
} from 'livekit-server-sdk';
import { Room } from '../models/index.js';

// Хост LiveKit для СЕРВЕРНЫХ вызовов (HTTP API, не ws). LIVEKIT_URL (wss://.../livekit) —
// клиентский, для API не годится. На проде LiveKit слушает localhost:7880 (тот же сервер).
// Если LiveKit не на этой машине — задай LIVEKIT_HOST в .env.
const LIVEKIT_HOST = process.env.LIVEKIT_HOST || 'http://localhost:7880';

const svc = new RoomServiceClient(
  LIVEKIT_HOST,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

// Источник из запроса → TrackSource LiveKit.
const SOURCE_MAP = {
  microphone: TrackSource.MICROPHONE,
  camera: TrackSource.CAMERA,
  screen: TrackSource.SCREEN_SHARE,
};

// Проверка «вызывающий — ОРГАНИЗАТОР этой комнаты». Если нет — сама отвечает 404/403 и
// возвращает null; иначе возвращает room. Модель C: модератор = room.organizerId.
async function requireOrganizer(req, res) {
  const room = await Room.findOne({ where: { code: req.params.code } });
  if (!room) {
    res.status(404).json({ error: 'Комната не найдена' });
    return null;
  }
  if (room.organizerId === null || req.user.id !== room.organizerId) {
    res.status(403).json({ error: 'Только организатор может управлять участниками' });
    return null;
  }
  return room;
}

// LiveKit-участники комнаты, относящиеся к targetUserId. identity = `${userId}__${deviceId}`,
// у юзера может быть несколько устройств → возвращаем всех подходящих.
async function participantsOfUser(roomCode, targetUserId) {
  const all = await svc.listParticipants(roomCode);
  const prefix = `${targetUserId}__`;
  return all.filter((p) => p.identity.startsWith(prefix));
}

// POST /api/rooms/:code/moderate/mute — ВЫКЛЮЧИТЬ трек участника (мик/камера/демка).
// Только выключение: включить обратно организатор НЕ может (privacy) — для этого ask-unmute.
export async function muteParticipant(req, res) {
  try {
    const room = await requireOrganizer(req, res);
    if (!room) return;

    const { targetUserId, source } = req.body || {};
    const trackSource = SOURCE_MAP[source];
    if (!Number.isInteger(targetUserId) || !trackSource) {
      return res.status(400).json({ error: 'Некорректные параметры' });
    }

    const parts = await participantsOfUser(room.code, targetUserId);
    for (const p of parts) {
      const track = (p.tracks || []).find((t) => t.source === trackSource);
      if (track) {
        await svc.mutePublishedTrack(room.code, p.identity, track.sid, true);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('muteParticipant error:', err.message);
    res.status(500).json({ error: 'Не удалось выключить' });
  }
}

// POST /api/rooms/:code/moderate/ask-unmute — ПОПРОСИТЬ участника включить мик/камеру.
// Форсить нельзя — шлём data-сообщение, клиент покажет тост с кнопкой «Включить».
export async function askUnmute(req, res) {
  try {
    const room = await requireOrganizer(req, res);
    if (!room) return;

    const { targetUserId, source } = req.body || {};
    if (!Number.isInteger(targetUserId) || !SOURCE_MAP[source]) {
      return res.status(400).json({ error: 'Некорректные параметры' });
    }

    const identities = (await participantsOfUser(room.code, targetUserId)).map((p) => p.identity);
    if (identities.length === 0) return res.json({ ok: true }); // никого не нашли — молча ок

    const payload = new TextEncoder().encode(JSON.stringify({ type: 'ask-unmute', source }));
    await svc.sendData(room.code, payload, DataPacket_Kind.RELIABLE, {
      destinationIdentities: identities,
      topic: 'moderation',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('askUnmute error:', err.message);
    res.status(500).json({ error: 'Не удалось отправить просьбу' });
  }
}

// POST /api/rooms/:code/moderate/kick — выгнать участника из звонка.
export async function kickParticipant(req, res) {
  try {
    const room = await requireOrganizer(req, res);
    if (!room) return;

    const { targetUserId } = req.body || {};
    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ error: 'Некорректные параметры' });
    }
    if (targetUserId === room.organizerId) {
      return res.status(400).json({ error: 'Нельзя выгнать организатора' });
    }

    const parts = await participantsOfUser(room.code, targetUserId);
    for (const p of parts) {
      await svc.removeParticipant(room.code, p.identity);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('kickParticipant error:', err.message);
    res.status(500).json({ error: 'Не удалось выгнать' });
  }
}
