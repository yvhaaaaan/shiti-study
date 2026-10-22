/** Read one local question image, retaining legibility while keeping storage below 2 MiB. */
export async function readCaptureImage(blob: Blob, signal?: AbortSignal): Promise<string> {
  const maxImageBytes = 2 * 1024 * 1024
  const cancelled = () => new Error('已取消题图读取。')
  const checkCancelled = () => { if (signal?.aborted) throw cancelled() }
  checkCancelled()
  if (!blob.size) throw new Error('图片文件为空，请重新选择。')
  if (blob.size > 20 * 1024 * 1024) throw new Error('原图超过 20MB，请裁剪为单道题后再添加。')
  if (!/^image\/(?:jpe?g|png|webp)$/i.test(blob.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片，文件夹和网页链接暂不支持。')

  function imageDataUrl(image: Blob) {
    checkCancelled()
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      const release = () => { signal?.removeEventListener('abort', abort); reader.onload = null; reader.onerror = null; reader.onabort = null }
      const abort = () => { release(); if (reader.readyState === FileReader.LOADING) reader.abort(); reject(cancelled()) }
      reader.onload = () => { const value = String(reader.result); release(); resolve(value) }
      reader.onerror = () => { release(); reject(new Error('题图读取失败，请重新添加。')) }
      reader.onabort = () => { release(); reject(cancelled()) }
      signal?.addEventListener('abort', abort, { once: true })
      reader.readAsDataURL(image)
    })
  }

  const previewUrl = URL.createObjectURL(blob)
  let photo: HTMLImageElement | null = null
  try {
    photo = await new Promise<HTMLImageElement>((resolve, reject) => {
      const preview = new Image()
      const release = () => { signal?.removeEventListener('abort', abort); preview.onload = null; preview.onerror = null }
      const abort = () => { release(); preview.src = ''; reject(cancelled()) }
      preview.onload = () => { release(); resolve(preview) }
      preview.onerror = () => { release(); reject(new Error('这张图片已损坏或格式不正确，请重新导出为 JPG、PNG 或 WebP。')) }
      signal?.addEventListener('abort', abort, { once: true })
      preview.src = previewUrl
    })
    checkCancelled()
    const { naturalWidth: width, naturalHeight: height } = photo
    if (!width || !height || width * height > 64000000 || Math.max(width, height) > 20000) throw new Error('图片尺寸过大，请先裁剪到单道题后再添加。')
    if (blob.size <= maxImageBytes && Math.max(width, height) <= 2400) return await imageDataUrl(blob.type.toLowerCase() === 'image/jpg' ? blob.slice(0, blob.size, 'image/jpeg') : blob)

    const canvas = document.createElement('canvas')
    try {
      for (const edge of [1800, 1600, 1400, 1200]) {
        checkCancelled()
        const scale = Math.min(1, edge / Math.max(width, height))
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const painter = canvas.getContext('2d')
        if (!painter) throw new Error('图片处理失败，请裁剪后重试。')
        painter.fillStyle = '#ffffff'
        painter.fillRect(0, 0, canvas.width, canvas.height)
        painter.drawImage(photo, 0, 0, canvas.width, canvas.height)
        for (const quality of [0.92, 0.85, 0.76, 0.65]) {
          const reduced = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
          checkCancelled()
          if (reduced && reduced.size <= maxImageBytes) return await imageDataUrl(reduced)
        }
      }
    } finally { canvas.width = 0; canvas.height = 0 }
    throw new Error('图片仍然过大，请裁剪为单道题后重试。')
  } finally { URL.revokeObjectURL(previewUrl); if (photo) photo.src = '' }
}
