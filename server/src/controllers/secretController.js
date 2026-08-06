import { Secret } from '../models/index.js';
import { generateSecretId } from '../utils/secretId.js';

const MAX_CIPHERTEXT = 100 * 1024; // 100 КБ — лимит на шифроблоб, чтобы не завалили БД

// Подобрать свободный id. При 128 битах коллизия почти невозможна, но проверить дёшево.
async function generateUniqueId() {
  for (let i = 0; i < 5; i++) {
    const id = generateSecretId();
    const existing = await Secret.findByPk(id);
    if (!existing) return id;
  }
  throw new Error('Не удалось подобрать id секрета');
}

// Протух ли секрет (expiresAt задан и уже в прошлом). null = бессрочно → никогда не протух.
function isExpired(secret) {
  return secret.expiresAt && new Date(secret.expiresAt).getTime() < Date.now();
}

// POST /api/secrets — создать секрет. Сервер видит только шифроблоб + iv (не plaintext).
// Принимаем ТОЛЬКО тело шифрования + срок: пароля нет, секрет всегда одноразовый.
export async function createSecret(req, res) {
  try {
    const { ciphertext, iv, ttlSeconds } = req.body;

    // Валидация: обязательные поля + лимит размера.
    if (!ciphertext || typeof ciphertext !== 'string') {
      return res.status(400).json({ error: 'Пустой секрет' });
    }
    if (ciphertext.length > MAX_CIPHERTEXT) {
      return res.status(413).json({ error: 'Секрет слишком большой' });
    }
    if (typeof iv !== 'string' || !iv) {
      return res.status(400).json({ error: 'Некорректные данные шифрования' });
    }

    // Срок жизни: положительное число → now + ttl; иначе (null/невалид) → бессрочно.
    let expiresAt = null;
    if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
      expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    }

    const id = await generateUniqueId();
    await Secret.create({ id, ciphertext, iv, expiresAt });

    res.status(201).json({ id });
  } catch (err) {
    // Наружу — только генерик: err.message может содержать детали БД/Sequelize,
    // которые клиенту знать не положено. Подробности — в серверный лог.
    console.error('createSecret error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// GET /api/secrets/:id/meta — метаданные (существует ли секрет). НЕ сжигает.
// Отдаём по GET специально: превью-боты мессенджеров дёрнут их, но секрет не сгорит.
export async function getMeta(req, res) {
  try {
    const secret = await Secret.findByPk(req.params.id);
    if (!secret || isExpired(secret)) {
      if (secret) await secret.destroy(); // протухший — заодно уберём
      return res.json({ exists: false });
    }
    res.json({ exists: true });
  } catch (err) {
    console.error('getMeta error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// POST /api/secrets/:id — забрать шифроблоб. ВСЕГДА сжигает (секрет одноразовый).
// Именно POST, а не GET: боты-превьюшники POST не делают → не сожгут секрет до получателя.
export async function consumeSecret(req, res) {
  try {
    const secret = await Secret.findByPk(req.params.id);
    if (!secret || isExpired(secret)) {
      if (secret) await secret.destroy();
      return res.status(404).json({ error: 'Секрет не найден или истёк' });
    }

    // Снимаем данные ДО удаления.
    const payload = { ciphertext: secret.ciphertext, iv: secret.iv };

    // Атомарное сжигание. destroy по условию возвращает ЧИСЛО удалённых строк:
    // два одновременных запроса оба пройдут findByPk выше, но удалить строку успеет
    // только один — второму DELETE вернёт 0, и он уйдёт с 404. Без этого оба прочитали
    // бы одноразовый секрет (гонка check-then-act).
    const deleted = await Secret.destroy({ where: { id: secret.id } });
    if (deleted === 0) {
      return res.status(404).json({ error: 'Секрет не найден или истёк' });
    }

    res.json(payload);
  } catch (err) {
    console.error('consumeSecret error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
