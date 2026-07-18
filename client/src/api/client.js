import axios from 'axios'

// Единый axios-инстанс: базовый адрес задаём один раз, дальше пишем короткие пути ('/api/health').
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // слать и принимать cookie (наш httpOnly токен) при кросс-origin запросах
})
