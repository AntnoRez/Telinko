import bcrypt from 'bcrypt';
import { User } from '../models/index.js';
import { signToken } from '../utils/jwt.js';

// Имя cookie и её настройки — в одном месте, чтобы совпадали при установке и удалении.
// ВАЖНО: то же имя ('token') читает middleware requireAuth.
const COOKIE_NAME = 'token';
const cookieOptions = {
  httpOnly: true, // JS в браузере не может прочитать cookie → защита от XSS-кражи токена
  sameSite: 'lax', // не отправлять cookie на сторонние сайты (базовая защита от CSRF)
  secure: false, // на localhost http; на проде (https) обязательно true
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней в мс — совпадает с сроком жизни JWT
};

// Простенькая проверка формата email (что-то@что-то.что-то). Полноценный RFC-парсинг
// не нужен: это защита от опечаток, а не истина — её всё равно подтвердит Sequelize (isEmail).
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Фиктивный хеш для dummy-compare при логине с несуществующим email (см. login).
// Считается один раз при старте процесса.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-matches', 10);

// Отдаём наружу юзера БЕЗ passwordHash — хеш клиенту не нужен и не должен утекать.
function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName };
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
