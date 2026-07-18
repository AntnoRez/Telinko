import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* BrowserRouter включает клиентский роутинг для всего приложения:
        отслеживает адрес и управляет историей браузера (кнопки назад/вперёд). */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
