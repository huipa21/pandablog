import { describe, expect, it } from 'vitest'
import { mediaRecordVisibleToUser, mediaRecordManageableByUser } from '../../server/utils/mediaPermissions'
import { mediaNormalizeFileRecord } from '../../server/utils/mediaLibrary'

const author = {id: 'users:fixture', username: 'fixture', role: 'author' as const}
describe('media projection fail-closed policy', () => {
  it('missing visibility cannot normalize to public or authorize an admin', () => {
    const projected = mediaNormalizeFileRecord({id: `files:${'a'.repeat(64)}`, original_name: 'private-fixture'})
    expect(mediaRecordVisibleToUser(projected, null)).toBe(false)
    expect(mediaRecordManageableByUser(projected, {...author, role: 'admin'})).toBe(false)
  })
  it('another author cannot read private metadata; explicit public and owner remain usable', () => {
    const privateFile = mediaNormalizeFileRecord({id: `files:${'a'.repeat(64)}`, visibility: 'private', created_by: 'users:other'})
    expect(mediaRecordVisibleToUser(privateFile, author)).toBe(false)
    expect(mediaRecordVisibleToUser({...privateFile, created_by: author.id}, author)).toBe(true)
    expect(mediaRecordVisibleToUser({...privateFile, visibility: 'public'}, null)).toBe(true)
  })
})
