import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { computePHash } from './imageHash'
import { mediaResolveVariantPath, mediaVariantRelativePath } from './fileStorage'
import { imageAdmission, imageDecoderOptions } from './image-work'
import type { MediaImageMeta, MediaVariantRecord, MediaVariantSize } from '~/types/content'

const mediaImageMimePattern = /^image\/(jpeg|png|webp|gif|avif|tiff|svg\+xml)$/i
export interface MediaProcessedImage {
  is_image: boolean
  image_meta: MediaImageMeta | null
  variants: Partial<Record<MediaVariantSize, MediaVariantRecord>> | null
  perceptual_hash: string | null
}
const IMAGE_VARIANT_PROFILES = {
  thumbnail: {width: 360, height: 360, fit: 'cover', quality: 82},
  medium: {width: 1024, height: 1024, fit: 'inside', quality: 84},
  large: {width: 1600, height: 1600, fit: 'inside', quality: 86}
} as const
export function mediaIsImageMimeType(mimeType: string) { return mediaImageMimePattern.test(mimeType) }

/** Stage output is never a shared final path. Restore may explicitly write its
 * fenced generation's final paths. Both callers use the same native budget. */
export async function mediaProcessImageFile(file: string, hash: string, mimeType: string, enablePerceptualHash: boolean, createdAt = new Date(), stage?: string, signal?: AbortSignal): Promise<MediaProcessedImage> {
  if (!mediaIsImageMimeType(mimeType)) return {is_image: false, image_meta: null, variants: null, perceptual_hash: null}
  const release = await imageAdmission.acquire(signal)
  try {
    if (signal?.aborted) throw new Error('Image work aborted')
    const metadata = await sharp(file, imageDecoderOptions).metadata()
    const expected: Record<string, string[]> = {jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'], gif: ['image/gif'], heif: ['image/avif'], tiff: ['image/tiff'], svg: ['image/svg+xml']}
    if (!expected[metadata.format ?? '']?.includes(mimeType.toLowerCase())) throw new Error('Image content type does not match declared type')
    const imageMeta: MediaImageMeta = {
      width: metadata.width ?? null, height: metadata.height ?? null, format: metadata.format ?? null,
      has_alpha: Boolean(metadata.hasAlpha), exif: {has_exif: Boolean(metadata.exif?.length), orientation: metadata.orientation ?? null, density: metadata.density ?? null, space: metadata.space ?? null}
    }
    const variants: Partial<Record<MediaVariantSize, MediaVariantRecord>> = {}
    for (const size of Object.keys(IMAGE_VARIANT_PROFILES) as MediaVariantSize[]) {
      if (signal?.aborted) throw new Error('Image work aborted')
      const profile = IMAGE_VARIANT_PROFILES[size]
      const path = mediaVariantRelativePath(hash, size, 'webp', createdAt)
      const output = stage ? join(stage, `${size}.webp`) : mediaResolveVariantPath(path)
      await mkdir(dirname(output), {recursive: true})
      const result = await sharp(file, imageDecoderOptions).rotate()
        .resize(profile.width, profile.height, {fit: profile.fit, withoutEnlargement: true})
        .webp({quality: profile.quality}).toFile(output)
      variants[size] = {path, url: '', mime_type: 'image/webp', width: result.width, height: result.height, size: result.size}
    }
    const perceptualHash = enablePerceptualHash ? (await computePHash(file)) || null : null
    if (signal?.aborted) throw new Error('Image work aborted')
    return {is_image: true, image_meta: imageMeta, variants, perceptual_hash: perceptualHash}
  } finally {release()}
}
