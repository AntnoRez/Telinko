// Сжать картинку в браузере перед загрузкой аватара: квадратный cover-кроп + ресайз до size px,
// экспорт в JPEG. Так в MinIO уходит крошечный файл (~40-100КБ), а не оригинал на несколько МБ.
// 512 (а не 256) — чтобы на retina и на крупной плитке звонка не было «мыла».
export function downscaleImage(file, size = 512) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      // cover-кроп: берём центральный квадрат исходника (min стороны), тянем на size×size.
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2

      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      // Белый фон: у JPEG нет прозрачности, иначе прозрачные PNG залились бы чёрным.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось обработать картинку'))),
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось прочитать картинку'))
    }
    img.src = url
  })
}
