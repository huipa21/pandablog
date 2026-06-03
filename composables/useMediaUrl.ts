function normalizeMediaBaseUrl(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  return raw.replace(/\/+$/, '')
}

function looksLikeMediaHash(value: string) {
  return /^[a-f0-9]{64}$/i.test(value)
}

export function extractMediaHash(value: string) {
  const input = String(value || '').trim()
  if (!input) return ''

  const apiMatch = input.match(/\/api\/media\/file\/([^/?#]+)/)
  if (apiMatch?.[1]) return decodeURIComponent(apiMatch[1])

  const mediaMatch = input.match(/\/media\/([^/?#]+)/)
  if (mediaMatch?.[1]) return decodeURIComponent(mediaMatch[1])

  if (looksLikeMediaHash(input)) return input

  return ''
}

export function buildPublicMediaUrl(hash: string, mediaBaseUrl: string) {
  const safeHash = encodeURIComponent(hash)
  if (!safeHash) return ''
  if (!mediaBaseUrl) return `/api/media/file/${safeHash}`
  return `${mediaBaseUrl}/media/${safeHash}`
}

export function useMediaUrl() {
  const { settings } = useMediaConfig()
  const mediaBaseUrl = computed(() => {
    return normalizeMediaBaseUrl(settings.value?.public_base_url)
  })

  function toPublicMediaUrl(idOrHashOrUrl: string) {
    const value = String(idOrHashOrUrl || '').trim()
    if (!value) return ''

    const hash = extractMediaHash(value)
      || (value.startsWith('files:') ? value.slice('files:'.length) : '')
      || (looksLikeMediaHash(value) ? value : '')

    if (!hash) {
      return value
    }

    return buildPublicMediaUrl(hash, mediaBaseUrl.value)
  }

  function resolveMediaUrl(value: string) {
    const source = String(value || '').trim()
    if (!source) return ''

    if (/^https?:\/\//i.test(source) && !/\/api\/media\/file\//i.test(source)) {
      return source
    }

    const hash = extractMediaHash(source)
      || (source.startsWith('files:') ? source.slice('files:'.length) : '')
      || (looksLikeMediaHash(source) ? source : '')
    if (!hash) {
      return source
    }

    return buildPublicMediaUrl(hash, mediaBaseUrl.value)
  }

  return {
    mediaBaseUrl,
    toPublicMediaUrl,
    resolveMediaUrl
  }
}