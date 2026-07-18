import { io } from 'socket.io-client'

// Единый socket.io-client на всё приложение (как наш axios-инстанс).
//
// autoConnect: false — НЕ подключаемся сразу при загрузке приложения.
// Соединение поднимем вручную (socket.connect()), только когда заходим в комнату,
// и закроем (socket.disconnect()), когда выходим. Держать сокет открытым на всех
// страницах незачем — он нужен только в чате.
//
// withCredentials: true — при подключении браузер пошлёт нашу httpOnly cookie,
// по ней сервер авторизует сокет (io.use на бэке).
export const socket = io(import.meta.env.VITE_API_URL, {
  autoConnect: false,
  withCredentials: true,
})
