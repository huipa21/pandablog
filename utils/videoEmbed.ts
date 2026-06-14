export type VideoProvider = 'youtube'

export interface VideoEmbedData {
  provider: VideoProvider
  videoId: string
  start: number
}

export const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?[^\s<>]*v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}(?:[^\s<>]*)?/gi

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function resolveVideoEmbed(rawUrl: string): VideoEmbedData | null {
  const parsed = normalizeUrl(extractEmbedUrl(rawUrl))
  if (!parsed) return null

  const videoId = getYouTubeVideoId(parsed)
  if (!videoId || !YOUTUBE_VIDEO_ID_RE.test(videoId)) return null

  return {
    provider: 'youtube',
    videoId,
    start: getYouTubeStartTime(parsed)
  }
}

export function buildYouTubeEmbedSrc(videoId: string, start = 0) {
  const src = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`)
  src.searchParams.set('rel', '0')
  src.searchParams.set('playsinline', '1')
  if (start > 0) {
    src.searchParams.set('start', String(Math.floor(start)))
  }
  return src.toString()
}

export function buildYouTubeWatchUrl(videoId: string, start = 0) {
  const url = new URL('https://www.youtube.com/watch')
  url.searchParams.set('v', videoId)
  if (start > 0) {
    url.searchParams.set('t', `${Math.floor(start)}s`)
  }
  return url.toString()
}

export function buildYouTubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
}

function extractEmbedUrl(rawInput: string) {
  const input = rawInput.trim()
  const iframeSrc = input.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]
    || input.match(/<iframe\b[^>]*\bsrc\s*=\s*([^\s>]+)/i)?.[1]
  return decodeHtmlEntities(iframeSrc || input)
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function normalizeUrl(rawUrl: string) {
  try {
    return new URL(rawUrl.trim())
  } catch {
    try {
      return new URL(`https://${rawUrl.trim()}`)
    } catch {
      return null
    }
  }
}

function getYouTubeVideoId(parsed: URL) {
  const hostname = parsed.hostname.toLowerCase()
  const pathname = parsed.pathname

  if (hostname === 'youtu.be') {
    const id = pathname.replace(/^\//, '').split('/')[0]
    return id || null
  }

  if (hostname.endsWith('youtube.com') || hostname.endsWith('youtube-nocookie.com')) {
    if (pathname.startsWith('/watch')) {
      return parsed.searchParams.get('v')
    }

    const segments = pathname.split('/').filter(Boolean)
    if (segments[0] === 'embed' && segments[1]) {
      return segments[1]
    }
    if (segments[0] === 'shorts' && segments[1]) {
      return segments[1]
    }
  }

  return null
}

function getYouTubeStartTime(parsed: URL) {
  return parseStartTime(parsed.searchParams.get('start')) || parseStartTime(parsed.searchParams.get('t')) || 0
}

function parseStartTime(value: string | null) {
  if (!value) return 0
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return 0
  if (/^\d+$/.test(trimmed)) return Number(trimmed)

  const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  if (!match) return 0

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return hours * 3600 + minutes * 60 + seconds
}