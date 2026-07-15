export interface PastedImageFile {
  name: string
  type: string
}

const extensionByMimeType: Record<string, string> = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/tiff': 'tif',
  'image/webp': 'webp'
}

function twoDigits(value: number) {
  return String(value).padStart(2, '0')
}

function imageExtension(file: PastedImageFile) {
  const match = /\.([a-z0-9]{1,10})$/i.exec(file.name)
  return match?.[1]?.toLowerCase() ?? extensionByMimeType[file.type.toLowerCase()] ?? 'png'
}

export function pastedImageFilename(file: PastedImageFile, date = new Date()) {
  const timestamp = [
    String(date.getFullYear()),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
    twoDigits(date.getHours()),
    twoDigits(date.getMinutes()),
    twoDigits(date.getSeconds())
  ].join('')

  return `pasted image ${timestamp}.${imageExtension(file)}`
}