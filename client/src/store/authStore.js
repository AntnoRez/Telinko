import { create } from 'zustand'
import { api } from '../api/client'
import { downscaleImage } from '../utils/image'

// Глобальное состояние авторизации. Любой компонент может подписаться
// на user/loading и вызвать login/register/logout, не прокидывая пропсы.
export const useAuthStore = create((set, get) => ({
  user: null, // текущий пользователь ({id,email,displayName}) или null, если не вошёл
  loading: true, // идёт ли ПЕРВИЧНАЯ проверка сессии (пока true — не знаем, вошёл ли юзер)

  // Проверить сессию при запуске приложения: есть ли живая cookie с токеном.
  // Токен httpOnly — из JS его не видно, поэтому спрашиваем у бэка «кто я».
  fetchMe: async () => {
    try {
      const res = await api.get('/api/auth/me')
      set({ user: res.data.user, loading: false })
    } catch {
      set({ user: null, loading: false }) // 401 → просто не авторизован, это не «поломка»
    }
  },

  register: async (email, password, displayName) => {
    const res = await api.post('/api/auth/register', { email, password, displayName })
    set({ user: res.data.user }) // бэк уже поставил cookie, нам осталось запомнить юзера
  },

  login: async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    set({ user: res.data.user })
  },

  // Гость по имени: заводит временный аккаунт (guest:true), бэк ставит cookie.
  // Так входит тот, кто НЕ логинится (может создавать комнаты и заходить, но не модератор).
  guest: async (displayName) => {
    const res = await api.post('/api/auth/guest', { displayName })
    set({ user: res.data.user })
  },

  // Одноклик-организатор: реальный аккаунт с рандомными кредами (guest:false → может стать
  // организатором). Возвращает { email, password } — показать пользователю ОДИН раз («сохрани,
  // если хочешь вернуться»). Используется в «Я организатор», когда гость решает залогиниться.
  quick: async (displayName, temporary) => {
    const res = await api.post('/api/auth/quick', { displayName, temporary })
    set({ user: res.data.user })
    return res.data.credentials
  },

  // Вход через GitHub (OAuth, popup-флоу). Открываем окно на /api/auth/github; сервер проводит
  // OAuth и в конце редиректит popup на наш роут /oauth/github (тот же origin), который сообщает
  // исход через BroadcastChannel (+ opener-фолбэк). По успеху сессия уже в cookie — подтягиваем
  // юзера через fetchMe. Возвращает user (или бросает: окно закрыли / ошибка / блокировщик popup).
  loginWithGithub: () => {
    const API_BASE = import.meta.env.VITE_API_URL || ''
    const popup = window.open(
      `${API_BASE}/api/auth/github`,
      'github-oauth',
      'width=600,height=720,menubar=no,toolbar=no'
    )
    if (!popup) {
      return Promise.reject(new Error('Не удалось открыть окно GitHub (блокировщик всплывающих окон?)'))
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const channel = 'BroadcastChannel' in window ? new BroadcastChannel('github-oauth') : null

      function cleanup() {
        settled = true
        if (channel) { channel.onmessage = null; channel.close() }
        window.removeEventListener('message', onWindowMessage)
        clearInterval(closedTimer)
      }
      async function finish(ok, err) {
        if (settled) return
        cleanup()
        if (!ok) return reject(err || new Error('Не удалось войти через GitHub'))
        try {
          await get().fetchMe() // сессия уже в cookie — узнаём, кто мы
          const u = get().user
          u ? resolve(u) : reject(new Error('Сессия не установилась'))
        } catch (e) {
          reject(e)
        }
      }
      // Основной канал: BroadcastChannel (same-origin, не зависит от window.opener/COOP).
      if (channel) channel.onmessage = (e) => { if (e.data?.source === 'github-oauth') finish(!!e.data.ok) }
      // Запасной канал: postMessage от opener-страницы (тот же origin, что и мы).
      function onWindowMessage(e) {
        if (e.origin !== window.location.origin) return
        if (e.data?.source === 'github-oauth') finish(!!e.data.ok)
      }
      window.addEventListener('message', onWindowMessage)
      // Окно закрыли, не завершив вход — не висим в промисе вечно. Небольшая фора, чтобы не
      // опередить только что пришедшее сообщение об успехе (popup закрывается через ~300мс после него).
      const closedTimer = setInterval(() => {
        if (popup.closed && !settled) {
          setTimeout(() => finish(false, new Error('Окно GitHub закрыто')), 400)
        }
      }, 500)
    })
  },

  // --- Профиль: сменить имя / аватар (логин не трогаем) ---

  // Сменить отображаемое имя. Возвращённый user содержит новый avatarVersion (не меняется тут).
  updateProfile: async (displayName) => {
    const res = await api.patch('/api/users/me', { displayName })
    set({ user: res.data.user })
  },

  // Загрузить аватар: сжимаем в браузере до 512px → шлём multipart. Ответ с новым avatarVersion
  // (в URL ?v=) заставит браузер взять свежую картинку вместо кэша.
  uploadAvatar: async (file) => {
    const blob = await downscaleImage(file, 512)
    const form = new FormData()
    form.append('avatar', blob, 'avatar.jpg')
    const res = await api.post('/api/users/me/avatar', form)
    set({ user: res.data.user })
  },

  // Убрать аватар — вернётся кружок с буквой.
  removeAvatar: async () => {
    const res = await api.delete('/api/users/me/avatar')
    set({ user: res.data.user })
  },

  logout: async () => {
    await api.post('/api/auth/logout') // бэк стирает cookie
    set({ user: null })
  },
}))
