/**
 * Classifies a media item (by mime type / extension) into a render kind.
 */
export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'file'

export function classifyMedia(mime: string | undefined | null, srcOrName?: string): MediaKind {
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf') return 'pdf'

  const ext = ((srcOrName ?? '').split('?')[0]?.split('#')[0]?.split('.').pop() ?? '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'm4a', 'aac', 'oga'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'

  return 'file'
}

/**
 * Returns a lucide icon name that visually represents the media kind/extension.
 */
export function mediaIcon(mime: string | undefined | null, srcOrName?: string): string {
  const m = (mime ?? '').toLowerCase()
  if (m.includes('wordprocessingml') || m === 'application/msword') return 'i-lucide-file-text'
  if (m.includes('spreadsheetml') || m === 'application/vnd.ms-excel' || m === 'text/csv') return 'i-lucide-file-spreadsheet'
  if (m.includes('presentationml') || m === 'application/vnd.ms-powerpoint') return 'i-lucide-presentation'

  const kind = classifyMedia(mime, srcOrName)
  if (kind === 'image') return 'i-lucide-image'
  if (kind === 'video') return 'i-lucide-film'
  if (kind === 'audio') return 'i-lucide-music'
  if (kind === 'pdf') return 'i-lucide-file-text'

  const ext = ((srcOrName ?? '').split('?')[0]?.split('#')[0]?.split('.').pop() ?? '').toLowerCase()
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'i-lucide-file-archive'
  if (['doc', 'docx'].includes(ext)) return 'i-lucide-file-text'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'i-lucide-file-spreadsheet'
  if (['ppt', 'pptx'].includes(ext)) return 'i-lucide-presentation'
  if (['txt', 'md', 'log'].includes(ext)) return 'i-lucide-file-text'
  return 'i-lucide-file'
}

export function formatBytes(size: number | null | undefined): string {
  if (!size || !Number.isFinite(size)) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = size
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}
