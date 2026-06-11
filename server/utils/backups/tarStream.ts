import { createReadStream, createWriteStream } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import type { Readable } from 'node:stream'
import * as tar from 'tar'

const SAFE_HASH_FILENAME = /^[a-f0-9]{64}\.[a-z0-9]{1,10}$/i

/**
 * Creates a gzipped tar archive of the given list of files relative to `cwd`.
 * Uses gzip level 1 for speed over compression (media files rarely compress well).
 * Returns the total number of bytes written to outPath.
 */
export async function createMediaTar(
  relativePaths: string[],
  cwd: string,
  outPath: string,
  gzipLevel = 1,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  const total = relativePaths.length

  if (total === 0) {
    // Write an empty (header-only) tar.gz so the file always exists.
    await tar.c(
      { gzip: { level: gzipLevel }, cwd, file: outPath },
      []
    )
    onProgress?.(0, 0)
    return
  }

  let processed = 0
  await tar.c(
    {
      gzip: { level: gzipLevel },
      cwd,
      file: outPath,
      filter() {
        // Called once per entry that is about to be archived. Each entry in
        // relativePaths is a file, so this gives a reliable per-file count.
        processed++
        onProgress?.(processed, total)
        return true
      },
    },
    relativePaths
  )
}

/**
 * Extracts a gzipped tar archive into `destRoot`.
 * Hard-filtered: only accepts entries whose resolved path stays inside destRoot
 * and whose basename matches the sha256 hash filename pattern.
 *
 * Throws if a path-traversal entry is detected so the caller can abort.
 */
export async function extractMediaTar(
  srcPath: string,
  destRoot: string
): Promise<number> {
  let count = 0
  const absDestRoot = path.resolve(destRoot)

  await tar.x({
    file: srcPath,
    cwd: absDestRoot,
    gzip: true,
    filter(entryPath: string) {
      // Reject absolute paths and path traversal attempts
      if (path.isAbsolute(entryPath)) return false
      if (entryPath.includes('..')) return false

      const basename = path.basename(entryPath)
      // Allow the directory entries (no extension in basename test) to pass
      if (!basename.includes('.')) return true

      if (!SAFE_HASH_FILENAME.test(basename)) return false

      // Check resolved path stays inside destRoot
      const resolved = path.resolve(absDestRoot, entryPath)
      if (!resolved.startsWith(absDestRoot + path.sep) && resolved !== absDestRoot) {
        return false
      }

      count++
      return true
    },
  })

  return count
}

/**
 * Collects all file paths under `root` recursively, relative to `root`.
 * Only returns files whose basename matches the sha256 hash filename pattern.
 */
export async function collectOriginalPaths(root: string): Promise<string[]> {
  const results: string[] = []
  await collectDir(root, root, results)
  return results
}

async function collectDir(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectDir(root, full, out)
    } else if (entry.isFile() && SAFE_HASH_FILENAME.test(entry.name)) {
      out.push(path.relative(root, full))
    }
  }
}

/**
 * Removes all contents of a directory without removing the directory itself.
 */
export async function clearDirectory(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      return rm(full, { recursive: true, force: true })
    })
  )
}
