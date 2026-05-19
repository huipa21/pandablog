import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'

const UPLOADS_DIR = resolve(process.cwd(), 'storage/uploads')
const THUMBNAILS_DIR = resolve(process.cwd(), 'storage/uploads/thumbnails')

/**
 * Shard a hash into a directory structure to avoid huge directories
 * Example: "abc123def456" → "ab/cd"
 */
function getShardPath(hash: string): string {
  if (hash.length < 4) throw new Error('Hash must be at least 4 characters')
  return `${hash.substring(0, 2)}/${hash.substring(2, 4)}`
}

/**
 * Save a file buffer to storage
 * Returns the relative storage path (e.g., "ab/cd/abc123.jpg")
 */
export async function saveFile(hash: string, buffer: Buffer, extension: string): Promise<string> {
  const shard = getShardPath(hash)
  const relativePath = `${shard}/${hash}.${extension}`
  const fullPath = resolve(UPLOADS_DIR, relativePath)

  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, buffer)

  return relativePath
}

/**
 * Save a thumbnail to storage
 * Returns the relative storage path
 */
export async function saveThumbnail(hash: string, buffer: Buffer): Promise<string> {
  const shard = getShardPath(hash)
  const relativePath = `${shard}/${hash}.webp`
  const fullPath = resolve(THUMBNAILS_DIR, relativePath)

  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, buffer)

  return `thumbnails/${relativePath}`
}

/**
 * Read a file from storage
 */
export async function readStorageFile(relativePath: string): Promise<Buffer> {
  const fullPath = resolve(UPLOADS_DIR, relativePath)

  // Security: prevent directory traversal
  if (!fullPath.startsWith(UPLOADS_DIR)) {
    throw new Error('Invalid file path')
  }

  return await readFile(fullPath)
}

/**
 * Delete a file from storage
 */
export async function deleteStorageFile(relativePath: string): Promise<void> {
  const fullPath = resolve(UPLOADS_DIR, relativePath)

  // Security: prevent directory traversal
  if (!fullPath.startsWith(UPLOADS_DIR)) {
    throw new Error('Invalid file path')
  }

  if (existsSync(fullPath)) {
    await unlink(fullPath)
  }
}

/**
 * Delete a thumbnail from storage
 */
export async function deleteThumbnail(relativePath: string): Promise<void> {
  const fullPath = resolve(THUMBNAILS_DIR, relativePath)

  // Security: prevent directory traversal
  if (!fullPath.startsWith(THUMBNAILS_DIR)) {
    throw new Error('Invalid file path')
  }

  if (existsSync(fullPath)) {
    await unlink(fullPath)
  }
}
