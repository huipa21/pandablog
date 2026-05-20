import sharp from 'sharp'
import { computePHash } from './imageHash'
import { mediaWriteThumbnailBuffer } from './fileStorage'
import type { MediaImageMeta } from '~/types/content'

const mediaImageMimePattern = /^image\/(jpeg|png|webp|gif|avif|tiff|svg\+xml)$/i

export interface MediaProcessedImage {
  is_image: boolean
  image_meta: MediaImageMeta | null
  thumbnail_path: string | null
  perceptual_hash: string | null
}

export function mediaIsImageMimeType(mimeType: string) {
  return mediaImageMimePattern.test(mimeType)
}

export async function mediaProcessImageBuffer(buffer: Buffer, hash: string, mimeType: string, enablePerceptualHash: boolean): Promise<MediaProcessedImage> {
  if (!mediaIsImageMimeType(mimeType)) {
    return {
      is_image: false,
      image_meta: null,
      thumbnail_path: null,
      perceptual_hash: null
    }
  }

  const metadata = await sharp(buffer, { animated: false }).metadata()
  const imageMeta: MediaImageMeta = {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: metadata.format ?? null,
    has_alpha: Boolean(metadata.hasAlpha),
    exif: {
      has_exif: Boolean(metadata.exif?.length),
      orientation: metadata.orientation ?? null,
      density: metadata.density ?? null,
      space: metadata.space ?? null
    }
  }

  const thumbnailBuffer = await sharp(buffer, { animated: false })
    .rotate()
    .resize(300, 300, {
      fit: 'cover',
      withoutEnlargement: true
    })
    .webp({ quality: 82 })
    .toBuffer()

  const thumbnailPath = await mediaWriteThumbnailBuffer(hash, thumbnailBuffer)
  let perceptualHash: string | null = null

  if (enablePerceptualHash) {
    const computed = await computePHash(buffer)
    perceptualHash = computed || null
  }

  return {
    is_image: true,
    image_meta: imageMeta,
    thumbnail_path: thumbnailPath,
    perceptual_hash: perceptualHash
  }
}
