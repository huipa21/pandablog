import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { MediaRecord } from '../../types/content'

import { queryDb, queryDbRecord } from '../../server/utils/db'
import { mediaHashBuffer } from '../../server/utils/fileHash'
import { mediaDeleteStoredObjects, mediaWriteOriginalBuffer } from '../../server/utils/fileStorage'
import { mediaProcessImageBuffer } from '../../server/utils/imageProcessor'
import { mediaCleanupOrphanFiles, mediaListOrphanFiles } from '../../server/utils/mediaCleanup'
import {
  mediaCreateOrReuseFileRecord,
  mediaNormalizeFileRecord,
  mediaNormalizeFolderRecord,
  mediaCleanFolderName,
  mediaNormalizeHash,
  mediaNormalizeFolderId,
  mediaSearchFileRecords,
  type MediaSearchOptions
} from '../../server/utils/mediaLibrary'
import { mediaRecordManageableByUser, mediaRecordVisibleToUser } from '../../server/utils/mediaPermissions'
import type { MediaSettings } from '../../server/utils/settings'
import type { SessionUser } from '../../server/utils/users'

// Mock modules that touch filesystem, native libs, or DB
vi.mock('../../server/utils/db', () => ({ findBySlug: vi.fn(), queryDb: vi.fn(), queryDbRecord: vi.fn() }))
vi.mock('../../server/utils/fileHash', () => ({ mediaHashBuffer: vi.fn() }))
vi.mock('../../server/utils/fileStorage', () => ({
  mediaDeleteStoredObjects: vi.fn(),
  mediaOriginalRelativePath: vi.fn(),
  mediaStoredFilename: vi.fn((hash: string, ext: string) => `${hash}.${ext}`),
  mediaWriteOriginalBuffer: vi.fn()
}))
vi.mock('../../server/utils/imageProcessor', () => ({ mediaProcessImageBuffer: vi.fn() }))
vi.mock('../../server/utils/imageHash', () => ({ isSimilar: vi.fn() }))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    createError: (opts: { statusCode: number; message: string }) => {
      const err = new Error(opts.message) as Error & { statusCode: number }
      err.statusCode = opts.statusCode
      return err
    }
  }
})

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function makeRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: 'files:abc123',
    hash: 'abc123',
    original_name: 'photo.jpg',
    stored_name: 'abc123.jpg',
    extension: 'jpg',
    mime_type: 'image/jpeg',
    size: 1024,
    original_path: '2024/01/abc123.jpg',
    visibility: 'public',
    created_by: null,
    uploaded_by: null,
    variants: {
      thumbnail: { path: 'thumbnail/2024/01/abc123.webp', mime_type: 'image/webp', width: 360, height: 360, size: 1000 },
      medium: { path: 'medium/2024/01/abc123.webp', mime_type: 'image/webp', width: 800, height: 600, size: 2000 },
      large: { path: 'large/2024/01/abc123.webp', mime_type: 'image/webp', width: 800, height: 600, size: 3000 }
    },
    is_image: true,
    image_meta: { width: 800, height: 600 },
    folders: [],
    tags: ['nature', 'travel'],
    comment: 'A nice photo',
    reference_count: 2,
    referenced_by: [],
    perceptual_hash: 'phash123',
    uploaded_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T11:00:00.000Z',
    ...overrides
  }
  // Keep the record id in sync with an overridden hash (ids must be unique).
  if (!('id' in overrides) && 'hash' in overrides) {
    record.id = `files:${String(overrides.hash)}`
  }
  return record
}

function makeRecord(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return mediaNormalizeFileRecord(makeRaw(overrides as Record<string, unknown>))
}

/**
 * Every query returns the given file rows, except the full-text statements
 * (`... @0@ $needle_N ...`), which are simulated: a file matches a needle when
 * its name or comment contains every word of it (case-insensitive), like the
 * ngram index.
 */
function mockDbReturning(records: Record<string, unknown>[]) {
  vi.mocked(queryDb).mockImplementation(async (_db: unknown, sql: string, params?: Record<string, unknown>) => {
    if (!sql.includes('@0@')) {
      return [[...records]]
    }
    const needles = Object.keys(params ?? {})
      .filter((key) => key.startsWith('needle_'))
      .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
      .map((key) => String(params![key]).toLowerCase())
    return needles.map((needle) => records
      .filter((record) => {
        const haystack = `${String(record.original_name ?? '')} ${String(record.comment ?? '')}`.toLowerCase()
        return needle.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
      })
      .map((record) => ({ id: record.id })))
  })
}

const mediaSettings: MediaSettings = {
  allowed_extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'txt'],
  max_file_size_mb: 10,
  oversized_image_threshold_mb: 0,
  max_files_per_upload: 5,
  enable_perceptual_dedup: true,
  perceptual_dedup_threshold: 5,
  download_cleanup_hours: 1,
  public_base_url: '',
  local_only: false,
  prevent_hotlinking: false,
  orphan_cleanup_enabled: false,
  orphan_cleanup_days: 30,
  orphan_cleanup_cron: '0 4 * * *'
}

// -------------------------------------------------------------------
// mediaNormalizeFileRecord
// -------------------------------------------------------------------

describe('mediaNormalizeFileRecord', () => {
  it('maps all fields correctly', () => {
    const record = mediaNormalizeFileRecord(makeRaw())
    expect(record.hash).toBe('abc123')
    expect(record.original_name).toBe('photo.jpg')
    expect(record.extension).toBe('jpg')
    expect(record.mime_type).toBe('image/jpeg')
    expect(record.size).toBe(1024)
    expect(record.is_image).toBe(true)
    expect(record.width).toBe(800)
    expect(record.height).toBe(600)
    expect(record.tags).toEqual(['nature', 'travel'])
    expect(record.comment).toBe('A nice photo')
    expect(record.reference_count).toBe(2)
    expect(record.thumbnail_url).toBe('/media/abc123?variant=thumbnail')
    expect(record.url).toBe('/media/abc123')
  })

  it('sets thumbnail_url to null when thumbnail variant is missing', () => {
    const record = mediaNormalizeFileRecord(makeRaw({ variants: { medium: { path: 'medium/2024/01/abc123.webp', mime_type: 'image/webp' } } }))
    expect(record.thumbnail_url).toBeNull()
  })

  it('deduplicates tags', () => {
    const record = mediaNormalizeFileRecord(makeRaw({ tags: ['a', 'b', 'a', 'b'] }))
    expect(record.tags).toEqual(['a', 'b'])
  })

  it('falls back gracefully for missing fields', () => {
    const record = mediaNormalizeFileRecord({ id: 'files:minimal', hash: 'min001' })
    expect(record.original_name).toBe('')
    expect(record.extension).toBe('')
    expect(record.mime_type).toBe('')
    expect(record.size).toBe(0)
    expect(record.is_image).toBe(false)
    expect(record.width).toBeNull()
    expect(record.height).toBeNull()
    expect(record.tags).toEqual([])
    expect(record.comment).toBeNull()
  })

  it('rejects non-finite numbers for width/height', () => {
    const record = mediaNormalizeFileRecord(makeRaw({ image_meta: { width: NaN, height: Infinity } }))
    expect(record.width).toBeNull()
    expect(record.height).toBeNull()
  })
})

// -------------------------------------------------------------------
// mediaCreateOrReuseFileRecord
// -------------------------------------------------------------------

describe('mediaCreateOrReuseFileRecord', () => {
  beforeEach(() => {
    vi.mocked(queryDb).mockReset()
    vi.mocked(queryDbRecord).mockReset()
    vi.mocked(mediaHashBuffer).mockReset()
    vi.mocked(mediaWriteOriginalBuffer).mockReset()
    vi.mocked(mediaProcessImageBuffer).mockReset()
  })

  it('uses NONE for non-image optional fields instead of NULL params', async () => {
    const hash = 'a'.repeat(64)
    vi.mocked(mediaHashBuffer).mockReturnValue(hash)
    vi.mocked(mediaWriteOriginalBuffer).mockResolvedValue('2024/01/doc.pdf')
    vi.mocked(mediaProcessImageBuffer).mockResolvedValue({
      is_image: false,
      image_meta: null,
      variants: null,
      perceptual_hash: null
    })
    vi.mocked(queryDbRecord).mockResolvedValueOnce(null)
    vi.mocked(queryDb)
      .mockResolvedValueOnce([[makeRaw({
        id: `files:${hash}`,
        hash,
        original_name: 'doc.pdf',
        stored_name: `${hash}.pdf`,
        extension: 'pdf',
        mime_type: 'application/pdf',
        is_image: false,
        image_meta: undefined,
        variants: undefined,
        perceptual_hash: undefined,
        original_path: '2024/01/doc.pdf'
      })]])

    await mediaCreateOrReuseFileRecord({} as never, {
      originalName: 'doc.pdf',
      data: Buffer.from('pdf'),
      mimeType: 'application/pdf'
    }, mediaSettings)

    const createCall = vi.mocked(queryDb).mock.calls.find((call) => String(call[1]).startsWith('CREATE'))
    expect(createCall?.[1]).toContain('image_meta: NONE')
    expect(createCall?.[1]).toContain('variants: NONE')
    expect(createCall?.[1]).toContain('perceptual_hash: NONE')
  })
})

// -------------------------------------------------------------------
// mediaNormalizeFolderRecord
// -------------------------------------------------------------------

describe('mediaNormalizeFolderRecord', () => {
  it('maps folder fields', () => {
    const folder = mediaNormalizeFolderRecord({
      id: 'folder:images',
      name: 'Images',
      slug: 'images',
      parent: null,
      created_at: '2024-01-01T00:00:00.000Z'
    })
    expect(folder.name).toBe('Images')
    expect(folder.slug).toBe('images')
    expect(folder.parent).toBeNull()
  })
})

// -------------------------------------------------------------------
// mediaCleanFolderName
// -------------------------------------------------------------------

describe('mediaCleanFolderName', () => {
  it('returns trimmed string', () => {
    expect(mediaCleanFolderName('  Photos  ')).toBe('Photos')
  })

  it('truncates to 120 characters', () => {
    const long = 'a'.repeat(200)
    expect(mediaCleanFolderName(long).length).toBe(120)
  })

  it('throws on empty string', () => {
    expect(() => mediaCleanFolderName('')).toThrow()
    expect(() => mediaCleanFolderName('   ')).toThrow()
  })

  it('throws on non-string input', () => {
    expect(() => mediaCleanFolderName(null)).toThrow()
  })
})

// -------------------------------------------------------------------
// mediaNormalizeHash
// -------------------------------------------------------------------

describe('mediaNormalizeHash', () => {
  it('accepts valid 64-char hex hash', () => {
    const hash = 'a'.repeat(64)
    expect(mediaNormalizeHash(hash)).toBe(hash)
  })

  it('normalizes to lowercase', () => {
    const hash = 'A'.repeat(64)
    expect(mediaNormalizeHash(hash)).toBe('a'.repeat(64))
  })

  it('throws on short hash', () => {
    expect(() => mediaNormalizeHash('abc123')).toThrow()
  })

  it('throws on non-hex characters', () => {
    const invalid = 'z'.repeat(64)
    expect(() => mediaNormalizeHash(invalid)).toThrow()
  })
})

// -------------------------------------------------------------------
// mediaNormalizeFolderId
// -------------------------------------------------------------------

describe('mediaNormalizeFolderId', () => {
  it('extracts id from record id string', () => {
    expect(mediaNormalizeFolderId('folder:images')).toBe('images')
  })

  it('returns bare id as-is', () => {
    expect(mediaNormalizeFolderId('images')).toBe('images')
  })

  it('throws on empty string', () => {
    expect(() => mediaNormalizeFolderId('')).toThrow()
  })
})

// -------------------------------------------------------------------
// mediaRecordVisibleToUser / mediaRecordManageableByUser
// -------------------------------------------------------------------

describe('media visibility permissions', () => {
  const superadmin = { id: 'users:super', username: 'super', role: 'superadmin' } as SessionUser
  const admin = { id: 'users:admin', username: 'admin', role: 'admin' } as SessionUser
  const uploader = { id: 'users:author-a', username: 'author-a', role: 'author' } as SessionUser
  const otherAuthor = { id: 'users:author-b', username: 'author-b', role: 'author' } as SessionUser

  it('lets only the uploader and superadmin see private media', () => {
    const privateFile = makeRecord({ visibility: 'private', created_by: 'users:author-a', uploaded_by: 'author-a' })

    expect(mediaRecordVisibleToUser(privateFile, superadmin)).toBe(true)
    expect(mediaRecordVisibleToUser(privateFile, uploader)).toBe(true)
    expect(mediaRecordVisibleToUser(privateFile, admin)).toBe(false)
    expect(mediaRecordVisibleToUser(privateFile, otherAuthor)).toBe(false)
    expect(mediaRecordVisibleToUser(privateFile, null)).toBe(false)
  })

  it('keeps public media visible and manageable by admins', () => {
    const publicFile = makeRecord({ visibility: 'public', created_by: 'users:author-a', uploaded_by: 'author-a' })

    expect(mediaRecordVisibleToUser(publicFile, null)).toBe(true)
    expect(mediaRecordManageableByUser(publicFile, admin)).toBe(true)
  })

  it('does not let admin manage another uploader private media', () => {
    const privateFile = makeRecord({ visibility: 'private', created_by: 'users:author-a', uploaded_by: 'author-a' })

    expect(mediaRecordManageableByUser(privateFile, superadmin)).toBe(true)
    expect(mediaRecordManageableByUser(privateFile, uploader)).toBe(true)
    expect(mediaRecordManageableByUser(privateFile, admin)).toBe(false)
  })
})

// -------------------------------------------------------------------
// mediaListOrphanFiles / mediaCleanupOrphanFiles permissions
// -------------------------------------------------------------------

describe('media orphan permissions', () => {
  const uploader = { id: 'users:author-a', username: 'author-a', role: 'author' } as SessionUser

  beforeEach(() => {
    vi.mocked(queryDb).mockReset()
    vi.mocked(mediaDeleteStoredObjects).mockReset()
  })

  it('filters orphan listings through media visibility rules', async () => {
    mockDbReturning([
      makeRaw({ hash: 'public-file', visibility: 'public', created_by: 'users:author-b', uploaded_by: 'author-b', reference_count: 0, referenced_by: [] }),
      makeRaw({ hash: 'own-private', visibility: 'private', created_by: 'users:author-a', uploaded_by: 'author-a', reference_count: 0, referenced_by: [] }),
      makeRaw({ hash: 'other-private', visibility: 'private', created_by: 'users:author-b', uploaded_by: 'author-b', reference_count: 0, referenced_by: [] })
    ])

    const files = await mediaListOrphanFiles({} as never, undefined, uploader)

    expect(files.map((file) => file.hash)).toEqual(['public-file', 'own-private'])
  })

  it('only deletes orphan files the user can manage', async () => {
    mockDbReturning([
      makeRaw({ hash: 'public-other', visibility: 'public', created_by: 'users:author-b', uploaded_by: 'author-b', reference_count: 0, referenced_by: [] }),
      makeRaw({ hash: 'own-private', visibility: 'private', created_by: 'users:author-a', uploaded_by: 'author-a', reference_count: 0, referenced_by: [] })
    ])

    const result = await mediaCleanupOrphanFiles({} as never, { user: uploader })

    expect(result.deleted.map((file) => file.hash)).toEqual(['own-private'])
    expect(result.failed).toEqual([{ hash: 'public-other', reason: 'Insufficient permissions' }])
    expect(mediaDeleteStoredObjects).toHaveBeenCalledTimes(1)
  })
})

// -------------------------------------------------------------------
// mediaSearchFileRecords – filtering behaviour
// -------------------------------------------------------------------

describe('mediaSearchFileRecords', () => {
  beforeEach(() => {
    vi.mocked(queryDb).mockReset()
  })

  async function search(opts: MediaSearchOptions, records: Record<string, unknown>[]) {
    mockDbReturning(records)
    return mediaSearchFileRecords({} as never, opts)
  }

  it('returns all files when no filters applied', async () => {
    const raw = [makeRaw(), makeRaw({ hash: 'def456', original_name: 'video.mp4', is_image: false, mime_type: 'video/mp4', extension: 'mp4' })]
    const result = await search({}, raw)
    expect(result.total).toBe(2)
    expect(result.files).toHaveLength(2)
  })

  it('filters by text search (case insensitive default)', async () => {
    const raw = [makeRaw({ original_name: 'holiday.jpg' }), makeRaw({ hash: 'def456', original_name: 'work.png' })]
    const result = await search({ search: 'HOLIDAY' }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.original_name).toBe('holiday.jpg')
  })

  it('filters by file name, extension, comment, and media tags case insensitively', async () => {
    const raw = [
      makeRaw({ original_name: 'Quarterly Report.PDF', extension: 'PDF', comment: 'Final copy', tags: ['Work'] }),
      makeRaw({ hash: 'x', original_name: 'holiday.jpg', extension: 'jpg', comment: 'Draft', tags: ['travel'] })
    ]
    const result = await search({ file_name: 'report', extension: 'pdf', comment: 'final', tags: ['work'] }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.original_name).toBe('Quarterly Report.PDF')
  })

  it('applies regex matching to media tag filters', async () => {
    const raw = [
      makeRaw({ tags: ['project-alpha'] }),
      makeRaw({ hash: 'x', tags: ['project-beta'] })
    ]
    const result = await search({ tags: ['alpha$'], search_regex: true }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.tags).toContain('project-alpha')
  })

  it('uses AND matching for multiple media tags by default', async () => {
    const raw = [
      makeRaw({ original_name: 'nature.jpg', tags: ['nature'] }),
      makeRaw({ hash: 'x', original_name: 'travel.jpg', tags: ['travel'] }),
      makeRaw({ hash: 'y', original_name: 'nature-travel.jpg', tags: ['nature', 'travel'] })
    ]
    const result = await search({ tags: ['nature', 'travel'] }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.original_name).toBe('nature-travel.jpg')
  })

  it('uses OR matching for multiple media tags when requested', async () => {
    const raw = [
      makeRaw({ original_name: 'nature.jpg', tags: ['nature'] }),
      makeRaw({ hash: 'x', original_name: 'travel.jpg', tags: ['travel'] }),
      makeRaw({ hash: 'y', original_name: 'nature-travel.jpg', tags: ['nature', 'travel'] })
    ]
    const result = await search({ tags: ['nature', 'travel'], tag_relation: 'or', sort: 'name_asc' }, raw)
    expect(result.total).toBe(3)
    expect(result.files.map((file) => file.original_name)).toEqual(['nature-travel.jpg', 'nature.jpg', 'travel.jpg'])
  })

  it('plain text search is case-insensitive even when case sensitivity is requested', async () => {
    // The full-text index lowercases; case sensitivity only applies to regex mode.
    const raw = [makeRaw({ original_name: 'Holiday.jpg' }), makeRaw({ hash: 'def456', original_name: 'work.jpg' })]
    const result = await search({ search: 'hOLIDAY', case_insensitive: false }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.original_name).toBe('Holiday.jpg')
  })

  it('filters by regex search (case sensitive)', async () => {
    const raw = [makeRaw({ original_name: 'Holiday.jpg' }), makeRaw({ hash: 'def456', original_name: 'holiday.jpg' })]
    const result = await search({ search: '^Holiday', search_regex: true, case_insensitive: false }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.original_name).toBe('Holiday.jpg')
  })

  it('includes typo-tolerant matches', async () => {
    const raw = [
      makeRaw({ original_name: 'beach-sunset.jpg', comment: '' }),
      makeRaw({ hash: 'def456', original_name: 'beech-tree.jpg', comment: '' }),
      makeRaw({ hash: 'x', original_name: 'mountain.jpg', comment: '' })
    ]
    // "beach" is a known word: exact only. "baech" is unknown: it is corrected
    // to "beach" (adjacent swap) and "beech" (substitution), both one edit.
    const exact = await search({ search: 'beach' }, raw)
    expect(exact.files.map((file) => file.original_name)).toEqual(['beach-sunset.jpg'])
    const fuzzy = await search({ search: 'baech' }, raw)
    expect(fuzzy.files.map((file) => file.original_name).sort()).toEqual(['beach-sunset.jpg', 'beech-tree.jpg'])
  })

  it('filters by regex search', async () => {
    const raw = [makeRaw({ original_name: 'img_001.jpg' }), makeRaw({ hash: 'x', original_name: 'banner.png' })]
    const result = await search({ search: '^img_\\d+', search_regex: true }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.original_name).toBe('img_001.jpg')
  })

  it('filters by type: image', async () => {
    const raw = [
      makeRaw({ is_image: true }),
      makeRaw({ hash: 'x', original_name: 'doc.pdf', is_image: false, mime_type: 'application/pdf', extension: 'pdf' })
    ]
    const result = await search({ type: 'image' }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.is_image).toBe(true)
  })

  it('filters by type: video', async () => {
    const raw = [
      makeRaw(),
      makeRaw({ hash: 'v', original_name: 'clip.mp4', is_image: false, mime_type: 'video/mp4', extension: 'mp4' })
    ]
    const result = await search({ type: 'video' }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.mime_type).toBe('video/mp4')
  })

  it('filters by tag', async () => {
    const raw = [
      makeRaw({ tags: ['nature'] }),
      makeRaw({ hash: 'x', tags: ['work'] })
    ]
    const result = await search({ tag: 'nature' }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.tags).toContain('nature')
  })

  it('treats the Default folder as the fallback bucket for unassigned files', async () => {
    const raw = [
      makeRaw({ original_name: 'unassigned.jpg', folders: [] }),
      makeRaw({ hash: 'x', original_name: 'defaulted.jpg', folders: ['folder:default'] }),
      makeRaw({ hash: 'y', original_name: 'images.jpg', folders: ['folder:images'] })
    ]

    vi.mocked(queryDb).mockResolvedValueOnce([[...raw]])
    vi.mocked(queryDbRecord).mockResolvedValueOnce({
      id: 'folder:default',
      name: 'Default',
      slug: 'default',
      parent: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z'
    })

    const result = await mediaSearchFileRecords({} as never, { folder: 'folder:default', sort: 'name_asc' })
    expect(result.total).toBe(2)
    expect(result.files.map((file) => file.original_name)).toEqual(['defaulted.jpg', 'unassigned.jpg'])
  })

  it('filters orphans (reference_count=0 and no referenced_by)', async () => {
    const raw = [
      makeRaw({ reference_count: 0, referenced_by: [] }),
      makeRaw({ hash: 'x', reference_count: 3, referenced_by: [] })
    ]
    const result = await search({ orphan: true }, raw)
    expect(result.total).toBe(1)
  })

  it('filters by filename_regex', async () => {
    const raw = [
      makeRaw({ original_name: 'DSC_0042.jpg' }),
      makeRaw({ hash: 'x', original_name: 'edited-final.jpg' })
    ]
    const result = await search({ filename_regex: '^DSC_\\d+' }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.original_name).toBe('DSC_0042.jpg')
  })

  it('invalid regex is silently ignored (no filter applied)', async () => {
    const raw = [makeRaw(), makeRaw({ hash: 'x' })]
    const result = await search({ filename_regex: '[invalid' }, raw)
    // Invalid regex compiles to null, so no filter – all returned
    expect(result.total).toBe(2)
  })

  it('paginates results', async () => {
    const raw = Array.from({ length: 10 }, (_, i) =>
      makeRaw({ hash: `hash${i}`, original_name: `file${i}.jpg` })
    )
    const result = await search({ page: 2, limit: 3 }, raw)
    expect(result.files).toHaveLength(3)
    expect(result.page).toBe(2)
    expect(result.pages).toBe(4)
    expect(result.total).toBe(10)
  })

  it('sorts by name_asc', async () => {
    const raw = [
      makeRaw({ original_name: 'zebra.jpg' }),
      makeRaw({ hash: 'x', original_name: 'apple.jpg' })
    ]
    const result = await search({ sort: 'name_asc' }, raw)
    expect(result.files[0]!.original_name).toBe('apple.jpg')
    expect(result.files[1]!.original_name).toBe('zebra.jpg')
  })

  it('sorts by name_desc', async () => {
    const raw = [
      makeRaw({ original_name: 'apple.jpg' }),
      makeRaw({ hash: 'x', original_name: 'zebra.jpg' })
    ]
    const result = await search({ sort: 'name_desc' }, raw)
    expect(result.files[0]!.original_name).toBe('zebra.jpg')
  })

  it('sorts by size_asc', async () => {
    const raw = [
      makeRaw({ size: 5000 }),
      makeRaw({ hash: 'x', size: 1000 })
    ]
    const result = await search({ sort: 'size_asc' }, raw)
    expect(result.files[0]!.size).toBe(1000)
  })

  it('filters by date range', async () => {
    const raw = [
      makeRaw({ uploaded_at: '2024-03-01T00:00:00.000Z' }),
      makeRaw({ hash: 'x', uploaded_at: '2023-06-15T00:00:00.000Z' })
    ]
    const result = await search({ uploaded_from: '2024-01-01', uploaded_to: '2024-12-31' }, raw)
    expect(result.total).toBe(1)
    expect(result.files[0]!.uploaded_at).toContain('2024-03-01')
  })
})
