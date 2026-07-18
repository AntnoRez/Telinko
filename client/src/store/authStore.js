import { create } from 'zustand'
import { api } from '../api/client'

// Глобальное состояние авторизации. Любой компонент может подписаться
// на user/loading и вызвать login/register/logout, не прокидывая пропсы.
export const useAuthStore = create((set) => ({
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

  logout: async () => {
    await api.post('/api/auth/logout') // бэк стирает cookie
    set({ user: null })
  },
}))
