import { queryDb, useDb } from './db'

export async function clearOtherFeaturedPosts(db: Awaited<ReturnType<typeof useDb>>, id: string) {
  await queryDb(
    db,
    'UPDATE post SET is_featured = false, featured_at = NONE WHERE is_featured = true AND id != type::record($table, $id);',
    { table: 'post', id },
    { label: 'clear other featured posts' }
  )
}