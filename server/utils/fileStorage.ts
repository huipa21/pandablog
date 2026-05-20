import { createReadStream } from 'node:fs'
import { access, mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const mediaUploadsRoot = resolve(process.cwd(), 'storage/uploads')
const mediaThumbnailsRoot = resolve(process.cwd(), 'storage/thumbnails')

export interface MediaStoredObjectPaths {
  storage_path?: string | null
  thumbnail_path?: string | null
}

export function mediaShardPath(hash: string) {
  assertMediaHash(hash)
  return `${hash.slice(0, 2)}/${hash.slice(2, 4)}`
}

export function mediaStoredFilename(hash: string, extension: string) {
  assertMediaHash(hash)
  const cleanExtension = mediaCleanExtension(extension)
  return cleanExtension ? `${hash}.${cleanExtension}` : hash
}

export function mediaUploadRelativePath(hash: string, extension: string) {
  return `${mediaShardPath(hash)}/${mediaStoredFilename(hash, extension)}`
}

export function mediaThumbnailRelativePath(hash: string) {
  return `${mediaShardPath(hash)}/${hash}.webp`
}

export async function mediaWriteUploadBuffer(hash: string, extension: string, buffer: Buffer) {
  const relativePath = mediaUploadRelativePath(hash, extension)
  const absolutePath = mediaResolveUploadPath(relativePath)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)

  return relativePath
}

export async function mediaWriteThumbnailBuffer(hash: string, buffer: Buffer) {
  const relativePath = mediaThumbnailRelativePath(hash)
  const absolutePath = mediaResolveThumbnailPath(relativePath)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)

  return relativePath
}

export function mediaResolveUploadPath(relativePath: string) {
  return assertPathInside(mediaUploadsRoot, relativePath)
}

export function mediaResolveThumbnailPath(relativePath: string) {
  return assertPathInside(mediaThumbnailsRoot, normalizeThumbnailPath(relativePath))
}

export function mediaCreateUploadStream(relativePath: string) {
  return createReadStream(mediaResolveUploadPath(relativePath))
}

export function mediaCreateThumbnailStream(relativePath: string) {
  return createReadStream(mediaResolveThumbnailPath(relativePath))
}

export async function mediaStatUpload(relativePath: string) {
  return await stat(mediaResolveUploadPath(relativePath))
}

export async function mediaStatThumbnail(relativePath: string) {
  return await stat(mediaResolveThumbnailPath(relativePath))
}

export async function mediaDeleteUploadPath(relativePath?: string | null) {
  if (!relativePath) {
    return
  }

  await unlinkIfExists(mediaResolveUploadPath(relativePath))
}

export async function mediaDeleteThumbnailPath(relativePath?: string | null) {
  if (!relativePath) {
    return
  }

  await unlinkIfExists(mediaResolveThumbnailPath(relativePath))
}

export async function mediaDeleteStoredObjects(paths: MediaStoredObjectPaths) {
  await Promise.all([
    mediaDeleteUploadPath(paths.storage_path),
    mediaDeleteThumbnailPath(paths.thumbnail_path)
  ])
}

function mediaCleanExtension(extension: string) {
  return extension.trim().toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9]/g, '')
}

function normalizeThumbnailPath(relativePath: string) {
  return relativePath.replace(/^thumbnails[\\/]/, '')
}

function assertMediaHash(hash: string) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error('Invalid SHA-256 hash')
  }
}

function assertPathInside(root: string, relativePath: string) {
  const normalizedRelativePath = relativePath.replace(/\\/g, '/')

  if (!normalizedRelativePath || normalizedRelativePath.startsWith('/') || normalizedRelativePath.split('/').includes('..')) {
    throw new Error('Invalid media path')
  }

  const absolutePath = resolve(root, normalizedRelativePath)
  const normalizedRoot = root.toLowerCase()
  const normalizedPath = absolutePath.toLowerCase()

  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot.toLowerCase()}${absolutePath.includes('\\') ? '\\' : '/'}`)) {
    throw new Error('Invalid media path')
  }

  return absolutePath
}

async function unlinkIfExists(absolutePath: string) {
  try {
    await access(absolutePath)
  } catch {
    return
  }

  await unlink(absolutePath)
}
