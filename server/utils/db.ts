import { Surreal } from 'surrealdb'

let client: Surreal | null = null
let connectionPromise: Promise<Surreal> | null = null

async function connectDb() {
  const config = useRuntimeConfig()
  const db = new Surreal()

  await withTimeout(db.connect(config.surrealUrl), 10_000, `Could not connect to SurrealDB at ${config.surrealUrl}`)
  await db.signin({
    username: config.surrealRoot,
    password: config.surrealRootPassword
  })
  await db.use({
    namespace: config.surrealNamespace,
    database: config.surrealDatabase
  })

  client = db
  return db
}

export async function useDb() {
  if (client) {
    return client
  }

  if (!connectionPromise) {
    connectionPromise = connectDb().catch((error) => {
      connectionPromise = null
      throw error
    })
  }

  return connectionPromise
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms)
      })
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}