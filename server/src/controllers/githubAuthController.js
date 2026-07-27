import crypto from 'crypto';
import { User } from '../models/index.js';
import { signToken } from '../utils/jwt.js';
import { COOKIE_NAME, cookieOptions } from './authController.js';

// --- Вход через GitHub (OAuth 2.0, Authorization Code, popup-флоу) ---
// Обмен кода на токен и запрос профиля делаем нативным fetch (Node 18+) — без доп. зависимостей.
// Флоу: клиент открывает popup на /github → сюда; редиректим на GitHub; GitHub возвращает popup
// на /github/callback; там меняем code→token→профиль, заводим/находим юзера, ставим сессию и
// отдаём крошечную HTML-страницу, которая через postMessage сообщает открывшей вкладке об успехе.

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_API_USER = 'https://api.github.com/user';
const GITHUB_API_EMAILS = 'https://api.github.com/user/emails';
const SCOPE = 'read:user user:email'; // профиль + доступ к email (email в профиле может быть скрыт)

// Cookie со state (CSRF-защита): связывает старт флоу и callback. Живёт только на время флоу.
const STATE_COOKIE = 'gh_oauth_state';
const stateCookieOptions = {
  httpOnly: true,
  sameSite: 'lax', // callback от GitHub — top-level GET-навигация → lax-cookie отправляется
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: 10 * 60 * 1000, // 10 минут на прохождение
};
// Для clearCookie — те же атрибуты БЕЗ maxAge (иначе Express ругается deprecation-варнингом).
const stateClearOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
};

// GET /api/auth/github — старт: ставим state и уводим popup на страницу авторизации GitHub.
export function githubStart(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL;
  if (!clientId || !callbackUrl) {
    // OAuth не сконфигурирован — не падаем, отвечаем понятно (частый кейс до ввода кредов).
    return res.status(500).send('Вход через GitHub не настроен на сервере (нет GITHUB_CLIENT_ID).');
  }

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, stateCookieOptions);

  const url = new URL(GITHUB_AUTHORIZE);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');
  res.redirect(url.toString());
}

// GET /api/auth/github/callback — GitHub вернул сюда code+state. Меняем на сессию и возвращаем
// popup на клиентский роут /oauth/github (ТОТ ЖЕ origin, что и открывшая вкладка). Оттуда клиент
// сообщит об исходе через BroadcastChannel и закроет окно. Возврат на свой origin надёжнее
// postMessage из кросс-origin popup: не зависит от COOP/window.opener (его рвёт страница GitHub).
export async function githubCallback(req, res) {
  const clientOrigin = process.env.CLIENT_ORIGIN || '';
  const done = (status) => res.redirect(`${clientOrigin}/oauth/github?status=${status}`);

  const fail = (reason) => {
    console.warn('githubCallback fail:', reason);
    res.clearCookie(STATE_COOKIE, stateClearOptions);
    return done('err');
  };

  try {
    const { code, state, error: ghError } = req.query;
    const savedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, stateClearOptions); // state одноразовый

    if (ghError) return fail(`github вернул ошибку: ${ghError} ${req.query.error_description || ''}`);
    if (!code) return fail('нет code в query');
    if (!state) return fail('нет state в query');
    if (!savedState) return fail('нет cookie gh_oauth_state (cookie не долетела)');
    if (state !== savedState) return fail('state не совпал (CSRF/cookie)');

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL;
    if (!clientId || !clientSecret) return fail('нет GITHUB_CLIENT_ID/SECRET в env');

    // 1. code → access_token
    const tokenRes = await fetch(GITHUB_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    const accessToken = tokenJson.access_token;
    if (!accessToken) return fail(`обмен code→token не удался: ${JSON.stringify(tokenJson)}`);

    const ghHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'telinko-app', // GitHub требует User-Agent, иначе 403
    };

    // 2. профиль
    const userRes = await fetch(GITHUB_API_USER, { headers: ghHeaders });
    if (!userRes.ok) return fail(`запрос /user не удался: HTTP ${userRes.status}`);
    const gh = await userRes.json();
    const githubId = gh?.id != null ? String(gh.id) : null;
    if (!githubId) return fail('в профиле нет id');

    // 3. email — в профиле может быть скрыт; тогда берём primary+verified из /user/emails.
    let email = typeof gh.email === 'string' ? gh.email : null;
    if (!email) {
      try {
        const emailsRes = await fetch(GITHUB_API_EMAILS, { headers: ghHeaders });
        if (emailsRes.ok) {
          const emails = await emailsRes.json();
          const primary = Array.isArray(emails)
            ? emails.find((e) => e.primary && e.verified)
            : null;
          email = primary?.email || null;
        }
      } catch {
        /* email не критичен — вход через GitHub работает и без него */
      }
    }
    email = email ? email.toLowerCase() : null;

    // 4. find-or-create по githubId. С email-аккаунтами НЕ сливаем (решение по плану).
    let user = await User.findOne({ where: { githubId } });
    if (!user) {
      // email проставляем, только если он свободен — иначе оставляем null, чтобы не задеть
      // чужой email-аккаунт (уникальный индекс + отказ от слияния).
      let emailToSet = email;
      if (emailToSet) {
        const clash = await User.findOne({ where: { email: emailToSet } });
        if (clash) emailToSet = null;
      }
      let displayName =
        (typeof gh.name === 'string' && gh.name.trim()) ||
        (typeof gh.login === 'string' && gh.login) ||
        'GitHub user';
      displayName = displayName.slice(0, 50);

      user = await User.create({
        githubId,
        email: emailToSet,
        displayName,
        guest: false, // реальный аккаунт → может стать организатором
        temporary: false,
      });
    }

    // 5. ставим нашу сессионную cookie (та же, что у остального логина) и рапортуем успех.
    res.cookie(COOKIE_NAME, signToken({ userId: user.id }), cookieOptions);
    return done('ok');
  } catch (err) {
    console.error('githubCallback error:', err.message);
    return fail('исключение: ' + err.message);
  }
}
