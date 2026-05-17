import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { useDb } from '../utils/db'

export default defineNitroPlugin(async () => {
  const db = await useDb()
  const schema = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')

  await db.query(schema)
})