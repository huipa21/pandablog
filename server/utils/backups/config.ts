import { resolve } from 'node:path'

export const BACKUPS_ROOT = resolve(process.cwd(), 'storage/backups')

/** Derives the plain HTTP(S) base URL from the SurrealDB WebSocket URL.
 *
 * Examples:
 *   ws://127.0.0.1:8000/rpc  →  http://127.0.0.1:8000
 *   wss://db.example.com/rpc →  https://db.example.com
 *   http://127.0.0.1:8000    →  http://127.0.0.1:8000
 */
export function surrealHttpBase(wsUrl: string): string {
  const url = wsUrl.trim()
  const httpUrl = url
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')

  return httpUrl.replace(/\/rpc$/, '').replace(/\/$/, '')
}

export interface BackupRecord {
  id: string
  type: 'full' | 'incremental' | 'partial'
  status: 'creating' | 'ready' | 'failed' | 'restoring'
  note: string | null
  parent: string | null
  chain_root: string | null
  included_hashes: string[]
  /** For partial backups: the subset of tables captured. null = all tables (full). */
  included_tables: string[] | null
  db_size_bytes: number
  media_size_bytes: number
  media_file_count: number
  manifest_sha256_db: string | null
  manifest_sha256_media: string | null
  created_at: string
  completed_at: string | null
  error: string | null
}
