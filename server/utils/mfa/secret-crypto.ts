import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto'
import { createError } from 'h3'

// Compatible v1 AES-256-GCM envelope. One bounded cached async key derivation.
// Rotation changes the key source and requires operator-managed reenrollment.
const KEY_SALT = 'pandablog::mfa::totp'
let cached: {fingerprint: string, promise: Promise<Buffer>} | undefined
function keySource(): string {
  const config = useRuntimeConfig()
  const dedicated = typeof config.mfaSecret === 'string' ? config.mfaSecret.trim() : ''
  const source = dedicated || (typeof config.session?.password === 'string' ? config.session.password : '')
  if ((!dedicated && source.length < 16) || !source || source.length > 4096) throw createError({statusCode: 500, message: 'MFA encryption key is not configured'})
  return source
}
async function key(): Promise<Buffer> {
  const source = keySource()
  const fingerprint = createHash('sha256').update(source).digest('hex')
  if (!cached) {
    const promise = new Promise<Buffer>((resolve, reject) => scrypt(source, KEY_SALT, 32, (error, key) => error ? reject(error) : resolve(key)))
    cached = {fingerprint, promise}
    void promise.catch(() => {if (cached?.promise === promise) cached = undefined})
  }
  // Runtime source changes must restart, not launch unbounded concurrent KDFs.
  if (cached.fingerprint !== fingerprint) throw createError({statusCode: 503, message: 'MFA key changed; restart and follow key rotation recovery'})
  return cached.promise
}
export async function encryptMfaSecret(plain: string): Promise<string> {
  if (typeof plain !== 'string' || !/^[A-Z2-7]{16,128}$/.test(plain)) throw createError({statusCode: 500, message: 'Invalid MFA secret'})
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', await key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':')
}
export async function decryptMfaSecret(payload: string): Promise<string> {
  if (typeof payload !== 'string' || payload.length > 1024) throw createError({statusCode: 500, message: 'Invalid stored MFA secret'})
  const [version, iv, tag, ciphertext, extra] = payload.split(':')
  if (version !== 'v1' || extra !== undefined || !iv || !/^[a-f0-9]{24}$/.test(iv) || !tag || !/^[a-f0-9]{32}$/.test(tag) || !ciphertext || !/^(?:[a-f0-9]{2}){16,128}$/.test(ciphertext)) throw createError({statusCode: 500, message: 'Invalid stored MFA secret'})
  try {
    const decipher = createDecipheriv('aes-256-gcm', await key(), Buffer.from(iv, 'hex'))
    decipher.setAuthTag(Buffer.from(tag, 'hex'))
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8')
    if (!/^[A-Z2-7]{16,128}$/.test(plain)) throw new Error('invalid secret')
    return plain
  } catch {throw createError({statusCode: 500, message: 'Stored MFA secret could not be decrypted'})}
}
