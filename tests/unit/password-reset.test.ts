import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import argon2 from 'argon2'
import type { Surreal } from 'surrealdb'
import { describe, expect, it, vi } from 'vitest'
import { JobStore } from '../../server/utils/backups/jobMutex'
import { resetPassword, resetUsername, validateResetPassword } from '../../scripts/password-reset/operation'
import { readHiddenPassword } from '../../scripts/password-reset/prompt'

const exec = promisify(execFile)
const cli = fileURLToPath(new URL('../../bin/panda.mjs', import.meta.url))
const secret = 'fixture-only-password'

function mockDb(rows: unknown[] = [{id: 'users:alice'}]) {
  const query = vi.fn(async () => [rows])
  return {query, db: {query} as unknown as Pick<Surreal, 'query'>}
}

function terminal() {
  const input = new PassThrough() as unknown as typeof process.stdin
  input.isTTY = true
  input.isRaw = false
  input.setRawMode = vi.fn((raw: boolean) => { input.isRaw = raw; return input })
  input.pause()
  const output = new PassThrough() as unknown as typeof process.stdout
  output.isTTY = true
  let printed = ''
  output.on('data', chunk => { printed += String(chunk) })
  return {input, output, printed: () => printed}
}

describe('password-reset operation', () => {
  it('normalizes usernames and rejects invalid ones', () => {
    expect(resetUsername(' Alice.Name ')).toBe('alice.name')
    for (const value of ['', 'ab', 'a'.repeat(65), 'users:alice', "alice'; DELETE users;", 'a b']) {
      expect(() => resetUsername(value)).toThrow(/Username/)
    }
  })

  it('enforces existing password policy and exact confirmation', () => {
    expect(() => validateResetPassword('short', 'short')).toThrow(/at least 8/)
    expect(() => validateResetPassword('a'.repeat(201), 'a'.repeat(201))).toThrow(/too long/)
    expect(() => validateResetPassword(secret, `${secret} `)).toThrow(/do not match/)
    expect(() => validateResetPassword(' password ', ' password ')).not.toThrow()
    expect(() => validateResetPassword('a'.repeat(200), 'a'.repeat(200))).not.toThrow()
  })

  it('stores only a compatible Argon2id hash and a fresh auth epoch', async () => {
    const {query, db} = mockDb()
    await resetPassword(db, ' ALICE ', secret, secret)
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0]! as unknown as [string, Record<string, string>]
    expect(sql).toContain('UPDATE users SET password_hash = $passwordHash')
    expect(sql).toContain('WHERE username = $username RETURN id')
    expect(sql).toContain('auth_epoch = $authEpoch')
    expect(sql).toContain('updated_at = time::now()')
    expect(sql).not.toMatch(/UPSERT|CREATE|active =|role =|totp_/)
    expect(params.username).toBe('alice')
    expect(params.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/)
    expect(await argon2.verify(params.passwordHash!, secret)).toBe(true)
    expect(params.authEpoch).toMatch(/^[a-f0-9]{48}$/)
    expect(Object.values(params)).not.toContain(secret)
    const oldEpoch = params.authEpoch
    await resetPassword(db, 'alice', secret, secret)
    expect((query.mock.calls[1]! as unknown as [string, Record<string, string>])[1].authEpoch).not.toBe(oldEpoch)
  })

  it('does not issue SQL for invalid passwords or mismatched confirmation', async () => {
    const {query, db} = mockDb()
    await expect(resetPassword(db, 'alice', secret, 'different')).rejects.toThrow(/do not match/)
    await expect(resetPassword(db, 'alice', 'short', 'short')).rejects.toThrow(/at least 8/)
    expect(query).not.toHaveBeenCalled()
  })

  it('fails for unknown users instead of creating one', async () => {
    const {db} = mockDb([])
    await expect(resetPassword(db, 'alice', secret, secret)).rejects.toMatchObject({uncertain: false, message: expect.stringContaining('was not found')})
  })

  it('redacts database errors and identifies uncertain writes', async () => {
    const {query, db} = mockDb()
    query.mockRejectedValue(new Error(`sensitive SQL parameters: ${secret}`))
    await expect(resetPassword(db, 'alice', secret, secret)).rejects.toMatchObject({uncertain: true, message: 'Database update failed. Its outcome may be uncertain; verify sign-in before retrying.'})
  })
})

describe('hidden password prompts', () => {
  it('reads without echo, supports editing, and restores terminal state', async () => {
    const tty = terminal()
    const pending = readHiddenPassword('Type password: ', tty.input, tty.output)
    expect(tty.input.isRaw).toBe(true)
    tty.input.write('typo\x15fixture-only-passwore\x7fd\r')
    expect(await pending).toBe(secret)
    expect(tty.printed()).toBe('Type password: \n')
    expect(tty.input.isRaw).toBe(false)
    expect(tty.input.isPaused()).toBe(true)
    expect(tty.input.listenerCount('keypress')).toBe(0)
    const confirm = readHiddenPassword('Confirm password: ', tty.input, tty.output)
    tty.input.write(`${secret}\r`)
    expect(await confirm).toBe(secret)
    expect(tty.printed()).not.toContain(secret)
  })

  it.each(['\x03', '\x04'])('cancels on Ctrl-C/Ctrl-D and restores raw mode', async key => {
    const tty = terminal()
    const pending = readHiddenPassword('Type password: ', tty.input, tty.output)
    tty.input.write(`partial${key}`)
    await expect(pending).rejects.toThrow(/cancelled/)
    expect(tty.input.isRaw).toBe(false)
    expect(tty.printed()).not.toContain('partial')
  })

  it('bounds password input and refuses non-TTY input', async () => {
    const tty = terminal()
    const pending = readHiddenPassword('Type password: ', tty.input, tty.output)
    tty.input.write('a'.repeat(201))
    await expect(pending).rejects.toThrow(/too long/)
    expect(tty.input.isRaw).toBe(false)
    tty.input.isTTY = false
    await expect(readHiddenPassword('Type password: ', tty.input, tty.output)).rejects.toThrow(/interactive terminal/)
  })
})

describe('panda password-reset CLI and maintenance ownership', () => {
  it('documents the command without accessing secrets or the DB', async () => {
    for (const args of [['help', 'password-reset'], ['password-reset', '--help']]) {
      const {stdout} = await exec(process.execPath, [cli, ...args])
      expect(stdout).toContain('panda password-reset <username>')
      expect(stdout).toContain('8–200 characters')
      expect(stdout).toContain('ROOT credentials are never used')
    }
  })

  it('rejects missing usernames, password arguments and non-interactive use', async () => {
    for (const args of [[], ['alice', secret], ['alice']]) {
      await expect(exec(process.execPath, [cli, 'password-reset', ...args])).rejects.toMatchObject({code: 1, stderr: expect.stringMatching(/Usage:|interactive terminal/)})
    }
  })

  it('serializes reset and app maintenance jobs using the same persisted mutex', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-password-reset-'))
    const app = new JobStore(root), reset = new JobStore(root)
    try {
      const job = await reset.acquire({id: 'fixture-reset', kind: 'password-reset', startedAt: new Date().toISOString()})
      await expect(app.acquire({id: 'fixture-restore', kind: 'restore', startedAt: new Date().toISOString()})).rejects.toThrow(/busy|recovery/)
      await reset.release(job)
      const appJob = await app.acquire({id: 'fixture-create', kind: 'create', startedAt: new Date().toISOString()})
      await expect(reset.acquire({id: 'fixture-reset-2', kind: 'password-reset', startedAt: new Date().toISOString()})).rejects.toThrow(/busy|recovery/)
      await app.release(appJob)
    } finally { await rm(root, {recursive: true, force: true}) }
  })
})
