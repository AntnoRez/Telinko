import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/index.js';
import { signToken } from '../utils/jwt.js';

// Имя cookie и её настройки — в одном месте, чтобы совпадали при установке и удалении.
// ВАЖНО: то же имя ('token') читает middleware requireAuth.
// Экспортируем имя и настройки cookie: их переиспользует githubAuthController, чтобы GitHub-вход
// ставил ТУ ЖЕ сессионную cookie 'token' с идентичными параметрами (единый источник правды).
export const COOKIE_NAME = 'token';
export const cookieOptions = {
  httpOnly: true, // JS в браузере не может прочитать cookie → защита от XSS-кражи токена
  sameSite: 'lax', // не отправлять cookie на сторонние сайты (базовая защита от CSRF)
  // secure: слать cookie только по https. Управляется через .env: на проде с TLS
  // ставим COOKIE_SECURE=true; на localhost и http-стадии деплоя — false/не задано
  // (иначе браузер молча отбросит cookie и логин «не будет работать»).
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней в мс — совпадает с сроком жизни JWT
};

// Простенькая проверка формата email (что-то@что-то.что-то). Полноценный RFC-парсинг
// не нужен: это защита от опечаток, а не истина — её всё равно подтвердит Sequelize (isEmail).
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Фиктивный хеш для dummy-compare при логине с несуществующим email (см. login).
// Считается один раз при старте процесса.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-matches', 10);

// Отдаём наружу юзера БЕЗ passwordHash — хеш клиенту не нужен и не должен утекать.
// guest отдаём: по нему клиент решает, можно ли нажать «Я организатор» (гостю — нельзя, нужен
// реальный аккаунт). Права модерации = ты ли организатор комнаты (user.id === room.organizerId).
function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, guest: user.guest };
}

// POST /api/auth/register
export async function register(req, res) {
  try {
    let { email, password, displayName } = req.body;

    // Клиент шлёт что угодно — сначала убеждаемся, что это вообще строки
    // (иначе .trim()/bcrypt упадут на объекте), потом нормализуем.
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof displayName !== 'string'
    ) {
      return res.status(400).json({ error: 'Заполни email, пароль и имя' });
    }

    // Email приводим к нижнему регистру: иначе Test@mail.ru и test@mail.ru стали бы
    // РАЗНЫМИ юзерами, а человек, набравший свою почту в другом регистре, не смог бы войти.
    email = email.trim().toLowerCase();
    displayName = displayName.trim();

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Заполни email, пароль и имя' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }
    if (displayName.length > 50) {
      return res.status(400).json({ error: 'Имя слишком длинное (до 50 символов)' });
    }

    // email уникален на уровне БД, но проверим заранее, чтобы дать понятную ошибку
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже есть' });
    }

    const passwordHash = await bcrypt.hash(password, 10); // 10 — «стоимость» хеширования
    const user = await User.create({ email, passwordHash, displayName });

    const token = signToken({ userId: user.id });
    res.cookie(COOKIE_NAME, token, cookieOptions); // кладём токен в httpOnly cookie
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    // Сюда попадает только неожиданное (валидацию мы уже прошли выше).
    // Наружу — генерик: err.message может содержать детали БД, клиенту они не положены.
    console.error('register error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// POST /api/auth/guest — быстрый вход ГОСТЕМ (без регистрации): только имя.
// Гость — обычный User с guest:true (МОЖЕТ создавать комнаты и заходить, но НЕ может стать
// организатором) и temporary:true (удалится по простою). Пароля/email нет → залогиниться под ним
// нельзя, это чистая сессия («рандомный сессионный ключ»). Эта дверь — для входа/создания БЕЗ
// логина; чтобы получить модерку, гость жмёт «Я организатор» и логинится (становясь реальным аккаунтом).
export async function guestSession(req, res) {
  try {
    let { displayName } = req.body;

    if (typeof displayName !== 'string') {
      return res.status(400).json({ error: 'Укажи имя' });
    }
    displayName = displayName.trim();
    if (!displayName) {
      return res.status(400).json({ error: 'Укажи имя' });
    }
    if (displayName.length > 50) {
      return res.status(400).json({ error: 'Имя слишком длинное (до 50 символов)' });
    }

    // email/passwordHash не задаём — остаются null (гость без учётных данных).
    const user = await User.create({ displayName, guest: true, temporary: true });

    const token = signToken({ userId: user.id });
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    console.error('guestSession error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// POST /api/auth/quick — одноклик-регистрация ОРГАНИЗАТОРА: сервер сам придумывает логин
// (синтетический email) и пароль, чтобы не проходить обычную регистрацию. Это реальный
// аккаунт (guest:false) → МОЖЕТ стать организатором комнаты (нажать «Я организатор» → модератор;
// модератор = organizerId). temporary — по галочке «удалить после сессий». Логин+пароль возвращаем
// ОДИН РАЗ: захочешь вернуться — войдёшь ими через /login.
export async function quickRegister(req, res) {
  try {
    let { displayName, temporary } = req.body;

    displayName = typeof displayName === 'string' ? displayName.trim() : '';
    if (!displayName) displayName = 'Организатор'; // имя не обязательно (в prejoin его обычно вводят)
    if (displayName.length > 50) {
      return res.status(400).json({ error: 'Имя слишком длинное (до 50 символов)' });
    }

    // Рандомные креды. email синтетический, но валидный по формату и практически уникальный
    // (48 бит энтропии в локальной части — коллизия исчезающе маловероятна).
    const email = `q-${crypto.randomBytes(6).toString('hex')}@temp.telinko.online`;
    const password = crypto.randomBytes(9).toString('base64url'); // ~12 символов
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      passwordHash,
      displayName,
      guest: false, // реальный аккаунт → может модерировать
      temporary: temporary === true, // галочка «удалить после сессий»
    });

    const token = signToken({ userId: user.id });
    res.cookie(COOKIE_NAME, token, cookieOptions);
    // Креды в открытом виде — ЕДИНСТВЕННЫЙ раз, когда юзер может их узнать (по HTTPS, себе же).
    res.status(201).json({ user: publicUser(user), credentials: { email, password } });
  } catch (err) {
    console.error('quickRegister error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    let { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Заполни email и пароль' });
    }
    email = email.trim().toLowerCase(); // та же нормализация, что при регистрации

    if (!email || !password) {
      return res.status(400).json({ error: 'Заполни email и пароль' });
    }

    const user = await User.findOne({ where: { email } });

    // bcrypt.compare выполняем ВСЕГДА, даже если юзера нет (тогда — с фиктивным хешем).
    // Иначе ответ «нет такого email» приходил бы заметно быстрее (~на 100 мс, без bcrypt),
    // и по таймингу можно было бы перебирать, какие email зарегистрированы.
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    // Специально НЕ говорим, что именно неверно (email или пароль) —
    // иначе подскажем злоумышленнику, какие email существуют.
    if (!user || !ok) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = signToken({ userId: user.id });
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}

// GET /api/auth/me — «кто я». Роут защищён requireAuth, поэтому req.user уже есть.
export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

// POST /api/auth/logout — стираем cookie с токеном.
export async function logout(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ ok: true });
}
