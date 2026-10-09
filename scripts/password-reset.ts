/** Standalone operator command; bundled separately from Nitro for the image. */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { Surreal } from 'surrealdb'
import { JobStore } from '../server/utils/backups/jobMutex'
import { UNCERTAIN_WRITE_QUIESCENCE_MS } from '../server/utils/maintenance'
import { databaseIdentifier, scopedCredentials } from '../server/utils/startup-config'
import { resetPassword, resetUsername, validateResetPassword } from './password-reset/operation'
import { PasswordResetError, readHiddenPassword } from './password-reset/prompt'

async function deadline<T>(work: PromiseLike<T>, message: string, ms = 15_000, uncertain = false): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PasswordResetError(message, uncertain)), ms)
    })])
  } finally { clearTimeout(timer) }
}

function databaseConfig() {
  // Only this subcommand reads .env; inherited container/shell values win.
  let fileEnv: Record<string, string | undefined> = {}
  const envPath = resolve('.env')
  try { if (existsSync(envPath)) fileEnv = parseEnv(readFileSync(envPath, 'utf8')) }
  catch { throw new PasswordResetError('Could not read .env.') }
  const value = (name: string) => process.env[name] ?? fileEnv[name]
  const url = value('NUXT_SURREAL_URL') || 'ws://127.0.0.1:8000/rpc'
  const namespace = value('NUXT_SURREAL_NAMESPACE') || 'main'
  const database = value('NUXT_SURREAL_DATABASE') || 'main'
  try {
    const endpoint = new URL(url)
    if (!['ws:', 'wss:', 'http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) throw new Error()
    databaseIdentifier(namespace, 'NUXT_SURREAL_NAMESPACE')
    databaseIdentifier(database, 'NUXT_SURREAL_DATABASE')
  } catch { throw new PasswordResetError('Invalid SurrealDB endpoint, namespace or database configuration.') }
  let credentials: { username: string, password: string }
  try {
    credentials = scopedCredentials({
      surrealAppUser: value('NUXT_SURREAL_APP_USER'),
      surrealAppPassword: value('NUXT_SURREAL_APP_PASSWORD')
    })
  } catch { throw new PasswordResetError('Valid NUXT_SURREAL_APP_USER and NUXT_SURREAL_APP_PASSWORD are required. ROOT credentials are not used.') }
  return { url, namespace, database, credentials }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || args[0]!.startsWith('-')) {
    throw new PasswordResetError('Usage: panda password-reset <username>')
  }
  const username = resetUsername(args[0]!)
  // Refuse pipes before reading credentials or touching storage/database.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new PasswordResetError('Password reset requires an interactive terminal (use docker exec -it).')
  }
  const config = databaseConfig()
  let password = await readHiddenPassword('Type password: ')
  let confirmation = await readHiddenPassword('Confirm password: ')
  validateResetPassword(password, confirmation)

  // Share the app's persisted job mutex: never overlap backup/restore/import.
  const store = new JobStore(resolve('storage/backups'), 0, UNCERTAIN_WRITE_QUIESCENCE_MS)
  let owner
  try {
    owner = await store.acquire({id: randomBytes(24).toString('hex'), kind: 'password-reset', startedAt: new Date().toISOString()})
  } catch { throw new PasswordResetError('Maintenance is busy or requires recovery. Try again after it completes; use panda recover for guidance.') }
  const db = new Surreal()
  let releaseAllowed = true
  let failure: unknown
  try {
    try {
      await deadline(db.connect(config.url, {reconnect: {enabled: false}}), 'Database connection timed out.', 10_000)
      await deadline(db.signin({namespace: config.namespace, database: config.database, ...config.credentials}), 'Database authentication timed out.', 10_000)
      await deadline(db.use({namespace: config.namespace, database: config.database}), 'Database selection timed out.', 10_000)
    } catch { throw new PasswordResetError('Could not connect or authenticate to SurrealDB using the scoped credentials. Check NUXT_SURREAL_* configuration and database availability.') }
    await deadline(resetPassword(db, username, password, confirmation), 'Database update timed out. Its outcome may be uncertain; verify sign-in before retrying.', 15_000, true)
  } catch (error) {
    failure = error
    // A lost response does not prove a write stopped. Preserve the app's
    // quiescence window before releasing the cross-process maintenance lock.
    if (error instanceof PasswordResetError && error.uncertain) {
      try { await store.markUncertain() }
      catch {
        releaseAllowed = false
        failure = new PasswordResetError('Could not persist uncertain-write safety state. Job ownership preserved; later jobs must wait for abandoned-job quiescence or an offline job-only remedy. Ordinary site restart is unaffected.')
      }
    }
  } finally {
    password = ''
    confirmation = ''
    await deadline(db.close(), 'Database close timed out.', 2_000).catch(() => {})
    // If uncertainty persistence failed, retain ownership for offline review.
    if (releaseAllowed) {
      try { await store.release(owner) }
      catch { failure = new PasswordResetError('Could not release job ownership; the password may already have changed. Ordinary site restart is unaffected; inspect jobs with panda recover.') }
    }
  }
  if (failure) throw failure
  console.info(`Password reset for '${username}'. Existing sessions and trusted devices are invalidated; account status and MFA are unchanged.`)
}

main().then(() => process.exit(0)).catch(error => {
  // No SDK errors, credentials, plaintext passwords, hashes or owner tokens.
  console.error(`panda: ${error instanceof PasswordResetError ? error.message : 'Password reset failed. Check configuration and maintenance state.'}`)
  process.exit(1)
})
