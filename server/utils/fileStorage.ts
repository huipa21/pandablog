import { constants, createReadStream } from 'node:fs'
import { copyFile, link, lstat, mkdir, open, stat, unlink } from 'node:fs/promises'
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

export async function mediaPublishStagedFile(source: string, relativePath: string, variant = false, claim: string) {
  const destination = variant ? mediaResolveVariantPath(relativePath) : mediaResolveOriginalPath(relativePath)
  if (!/^[a-f0-9-]{36}$/.test(claim)) throw new Error('Invalid publication claim')
  await mkdir(dirname(destination), {recursive: true})
  // Durable ownership witness on the destination mount. link is exclusive:
  // EEXIST never overwrites another object. The retained inode proves exactly
  // which object a interrupted publishing operation may remove on restart.
  const witness = `${destination}.${claim}.owned`
  await copyFile(source, witness, constants.COPYFILE_EXCL)
  const file = await open(witness, 'r+')
  try {await file.sync()} finally {await file.close()}
  await link(witness, destination)
  await syncMediaParents(destination)
}
export async function mediaFinishPublication(paths: MediaStoredObjectPaths, claim: string, retire = false) {
  if (!/^[a-f0-9-]{36}$/.test(claim)) throw new Error('Invalid publication claim')
  const objects = [paths.original_path ? mediaResolveOriginalPath(paths.original_path) : null,
    ...Object.values(paths.variants ?? {}).map(variant => variant?.path ? mediaResolveVariantPath(variant.path) : null)].filter((path): path is string => Boolean(path))
  for (const destination of objects) {
    const witness = `${destination}.${claim}.owned`
    const info = await lstat(witness, {bigint: true}).catch(error => {if (error.code !== 'ENOENT') throw error; return null})
    const final = await lstat(destination, {bigint: true}).catch(error => {if (error.code !== 'ENOENT') throw error; return null})
    if (retire && final && (!info || final.ino !== info.ino || final.dev !== info.dev || !info.isFile() || !final.isFile())) throw new Error('Unproven media publication ownership; offline recovery required')
    if (retire && final) await unlinkIfExists(destination)
    if (info) await unlinkIfExists(witness)
    await syncMediaParents(destination)
  }
}
async function syncMediaParents(file: string) {
  let directory = dirname(file)
  for (let depth = 0; depth < 4; depth++) {
    try {
      const handle = await open(directory, 'r')
      try {await handle.sync()} finally {await handle.close()}
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {directory = dirname(directory); continue}
      if (process.platform !== 'win32' || !['EISDIR', 'EINVAL', 'EPERM', 'EACCES', 'EBADF', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    }
    directory = dirname(directory)
  }
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
  try {await unlink(absolutePath)} catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
