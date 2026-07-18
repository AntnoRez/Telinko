// Куда вести после логина/реги по параметру ?redirect=.
// Пускаем ТОЛЬКО на внутренние пути ('/room/...'), чтобы через ?redirect нельзя было
// увести на чужой сайт (open-redirect). '//evil.com' начинается с '/', но браузер
// считает его внешним адресом — поэтому отсекаем и его.
export function safeRedirect(redirect) {
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect
  }
  return '/' // по умолчанию — на главную (лончер)
}
