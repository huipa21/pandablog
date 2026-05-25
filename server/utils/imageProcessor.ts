import sharp from 'sharp'
import { computePHash } from './imageHash'
import { mediaWriteVariantBuffer } from './fileStorage'
import type { MediaImageMeta, MediaVariantRecord, MediaVariantSize } from '~/types/content'

const mediaImageMimePattern = /^image\/(jpeg|png|webp|gif|avif|tiff|svg\+xml)$/i

export interface MediaProcessedImage {
  is_image: boolean
  image_meta: MediaImageMeta | null
  variants: Partial<Record<MediaVariantSize, MediaVariantRecord>> | null
  perceptual_hash: string | null
}

const IMAGE_VARIANT_PROFILES: Record<MediaVariantSize, {
  width: number
  height: number
  fit: 'cover' | 'inside'
  quality: number
}> = {
  thumbnail: { width: 360, height: 360, fit: 'cover', quality: 82 },
  medium: { width: 1024, height: 1024, fit: 'inside', quality: 84 },
  large: { width: 1600, height: 1600, fit: 'inside', quality: 86 }
}

export function mediaIsImageMimeType(mimeType: string) {
  return mediaImageMimePattern.test(mimeType)
}

export async function mediaProcessImageBuffer(
  buffer: Buffer,
  hash: string,
  mimeType: string,
  enablePerceptualHash: boolean,
  createdAt = new Date()
): Promise<MediaProcessedImage> {
  if (!mediaIsImageMimeType(mimeType)) {
    return {
      is_image: false,
      image_meta: null,
      variants: null,
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

  const variants: Partial<Record<MediaVariantSize, MediaVariantRecord>> = {}

  for (const [size, profile] of Object.entries(IMAGE_VARIANT_PROFILES) as Array<[MediaVariantSize, typeof IMAGE_VARIANT_PROFILES[MediaVariantSize]]>) {
    const pipeline = sharp(buffer, { animated: false })
      .rotate()
      .resize(profile.width, profile.height, {
        fit: profile.fit,
        withoutEnlargement: true
      })
      .webp({ quality: profile.quality })

    const outputBuffer = await pipeline.toBuffer()
    const outputMeta = await sharp(outputBuffer).metadata()
    const path = await mediaWriteVariantBuffer(hash, size, 'webp', outputBuffer, createdAt)

    variants[size] = {
      path,
      url: '',
      mime_type: 'image/webp',
      width: outputMeta.width ?? null,
      height: outputMeta.height ?? null,
      size: outputBuffer.byteLength
    }
  }

  let perceptualHash: string | null = null

  if (enablePerceptualHash) {
    const computed = await computePHash(buffer)
    perceptualHash = computed || null
  }

  return {
    is_image: true,
    image_meta: imageMeta,
    variants,
    perceptual_hash: perceptualHash
  }
}
