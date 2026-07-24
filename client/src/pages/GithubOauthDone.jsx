import { useEffect } from 'react'

// Финальная страница OAuth-флоу: сюда сервер редиректит popup после входа через GitHub
// (?status=ok|err). Она на ТОМ ЖЕ origin, что и открывшая вкладка, поэтому сообщает результат
// через BroadcastChannel (не зависит от window.opener, который рвёт COOP на стороне GitHub),
// и закрывается. window.opener.postMessage оставлен запасным путём (если BroadcastChannel нет).
function GithubOauthDone() {
  useEffect(() => {
    const ok = new URLSearchParams(window.location.search).get('status') === 'ok'
    const msg = { source: 'github-oauth', ok }

    try {
      const ch = new BroadcastChannel('github-oauth')
      ch.postMessage(msg)
      ch.close()
    } catch {
      /* BroadcastChannel не поддержан — сработает opener-фолбэк ниже */
    }
    try {
      window.opener?.postMessage(msg, window.location.origin)
    } catch {
      /* opener мог быть оборван COOP — это ок, основной канал BroadcastChannel */
    }

    const t = setTimeout(() => {
      try { window.close() } catch { /* не смогли закрыть — покажем текст ниже */ }
    }, 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
      <p>Готово, можно закрыть окно.</p>
    </div>
  )
}

export default GithubOauthDone
