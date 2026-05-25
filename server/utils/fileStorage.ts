import { createReadStream } from 'node:fs'
import { access, mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { MediaVariantSize } from '~/types/content'

const mediaOriginalsRoot = resolve(process.cwd(), 'storage/uploads')
const mediaVariantsRoot = resolve(process.cwd(), 'storage/variants')

interface MediaVariantPathHolder {
  path?: string | null
}

interface MediaStoredVariantMap {
  [key: string]: MediaVariantPathHolder | null | undefined
}

export interface MediaStoredObjectPaths {
  original_path?: string | null
  variants?: MediaStoredVariantMap | null
}

function mediaDatePathParts(date = new Date()) {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return { year, month }
}

function mediaYearMonthPath(hash: string, date = new Date()) {
  assertMediaHash(hash)
  const { year, month } = mediaDatePathParts(date)
  return `${year}/${month}`
}

export function mediaStoredFilename(hash: string, extension: string) {
  assertMediaHash(hash)
  const cleanExtension = mediaCleanExtension(extension)
  return cleanExtension ? `${hash}.${cleanExtension}` : hash
}

export function mediaOriginalRelativePath(hash: string, extension: string, date = new Date()) {
  return `${mediaYearMonthPath(hash, date)}/${mediaStoredFilename(hash, extension)}`
}

export function mediaVariantRelativePath(hash: string, size: MediaVariantSize, extension: string, date = new Date()) {
  const cleanExtension = mediaCleanExtension(extension) || 'webp'
  return `${size}/${mediaYearMonthPath(hash, date)}/${hash}.${cleanExtension}`
}

export async function mediaWriteOriginalBuffer(hash: string, extension: string, buffer: Buffer, date = new Date()) {
  const relativePath = mediaOriginalRelativePath(hash, extension, date)
  const absolutePath = mediaResolveOriginalPath(relativePath)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)

  return relativePath
}

export async function mediaWriteVariantBuffer(hash: string, size: MediaVariantSize, extension: string, buffer: Buffer, date = new Date()) {
  const relativePath = mediaVariantRelativePath(hash, size, extension, date)
  const absolutePath = mediaResolveVariantPath(relativePath)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, buffer)

  return relativePath
}

export function mediaResolveOriginalPath(relativePath: string) {
  return assertPathInside(mediaOriginalsRoot, relativePath)
}

export function mediaResolveVariantPath(relativePath: string) {
  return assertPathInside(mediaVariantsRoot, normalizeVariantPath(relativePath))
}

export function mediaCreateOriginalStream(relativePath: string) {
  return createReadStream(mediaResolveOriginalPath(relativePath))
}

export function mediaCreateVariantStream(relativePath: string) {
  return createReadStream(mediaResolveVariantPath(relativePath))
}

export async function mediaStatOriginal(relativePath: string) {
  return await stat(mediaResolveOriginalPath(relativePath))
}

export async function mediaStatVariant(relativePath: string) {
  return await stat(mediaResolveVariantPath(relativePath))
}

export async function mediaDeleteOriginalPath(relativePath?: string | null) {
  if (!relativePath) {
    return
  }

  await unlinkIfExists(mediaResolveOriginalPath(relativePath))
}

export async function mediaDeleteVariantPath(relativePath?: string | null) {
  if (!relativePath) {
    return
  }

  await unlinkIfExists(mediaResolveVariantPath(relativePath))
}

export async function mediaDeleteStoredObjects(paths: MediaStoredObjectPaths) {
  const variantDeletes = Object.values(paths.variants || {})
    .map((variant) => mediaDeleteVariantPath(variant?.path || null))

  await Promise.all([
    mediaDeleteOriginalPath(paths.original_path),
    ...variantDeletes
  ])
}

function mediaCleanExtension(extension: string) {
  return extension.trim().toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9]/g, '')
}

function normalizeVariantPath(relativePath: string) {
  return relativePath.replace(/^variants[\/]/, '')
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
