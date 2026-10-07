import { afterEach, describe, expect, it, vi } from 'vitest'
import { scopedCredentials } from '../../server/utils/startup-config'
const config = {surrealUrl: 'ws://fixture.invalid/rpc', surrealNamespace: 'fixture', surrealDatabase: 'fixture', surrealRoot: 'root', surrealRootPassword: 'root-secret', surrealAppUser: 'fixture_app', surrealAppPassword: 'quote"back\\secret', session: {password: 'x'.repeat(32)}, appOrigin: 'http://127.0.0.1:3000', public: {footerShowPoweredBy: false}}
afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.doUnmock('surrealdb'); vi.restoreAllMocks()})

describe('required scoped runtime identity in every environment', () => {
  it.each(['development', 'production'])('%s rejects absent, partial and invalid credentials before allocating any ROOT/runtime client', async mode => {
    vi.resetModules(); vi.stubEnv('NODE_ENV', mode)
    const construct = vi.fn()
    vi.doMock('surrealdb', () => ({Surreal: class {close = vi.fn(); constructor() {construct()}}}))
    const db = await import('../../server/utils/db')
    const {validateStartupConfig} = await import('../../server/utils/startup-config')
    for (const pair of [{surrealAppUser: '', surrealAppPassword: ''}, {surrealAppUser: 'fixture_app', surrealAppPassword: ''}, {surrealAppUser: '', surrealAppPassword: 'secret'}, {surrealAppUser: 'invalid;SQL', surrealAppPassword: 'secret'}]) {
      vi.stubGlobal('useRuntimeConfig', () => ({...config, ...pair}))
      expect(validateStartupConfig).toThrow('scoped SurrealDB runtime credentials')
      await expect(db.useDb()).rejects.toThrow()
      await expect(db.provisionAppDatabaseUser({} as never)).rejects.toThrow()
    }
    expect(construct).not.toHaveBeenCalled()
  })
  it.each(['fixture-app', '1fixture', 'fixture;SQL'])('explains an unsupported scoped username without echoing credentials: %s', username => {
    const error = (() => {
      try {scopedCredentials({surrealAppUser: username, surrealAppPassword: 'synthetic-secret'})} catch (error) {return error as Error}
      throw new Error('Expected validation failure')
    })()
    expect(error).toMatchObject({data: {kind: 'startup-configuration', reason: 'invalid-scoped-username'}})
    expect(error.message).toContain('NUXT_SURREAL_APP_USER')
    expect(error.message).toContain('no hyphens')
    expect(JSON.stringify(error)).not.toMatch(/synthetic-secret|fixture-app|1fixture|fixture;SQL/)
    expect(error.message).not.toContain(username)
  })
  it('trims identifiers but never trims password material', () => {
    expect(scopedCredentials({surrealAppUser: ' fixture_app ', surrealAppPassword: ' secret '})).toEqual({username: 'fixture_app', password: ' secret '})
  })
  it('scoped authentication failure is sanitized and never downgrades to ROOT', async () => {
    vi.resetModules()
    const signin = vi.fn().mockRejectedValue(new Error('quote"back\\secret nested root-secret'))
    const close = vi.fn().mockResolvedValue(undefined), construct = vi.fn()
    vi.doMock('surrealdb', () => ({Surreal: class {
      connect = vi.fn().mockResolvedValue(undefined); signin = signin; close = close
      constructor() {construct()}
    }}))
    vi.stubGlobal('useRuntimeConfig', () => config)
    const {useDb} = await import('../../server/utils/db')
    await expect(useDb()).rejects.toMatchObject({statusCode: 503, message: 'Database handshake failed (database authentication)', data: {kind: 'database-handshake', scope: 'database', phase: 'authentication'}})
    await expect(useDb()).rejects.toThrow('Database handshake failed')
    expect(construct).toHaveBeenCalledOnce()
    expect(signin).toHaveBeenCalledExactlyOnceWith({namespace: 'fixture', database: 'fixture', username: 'fixture_app', password: config.surrealAppPassword})
    expect(close).toHaveBeenCalledOnce()
  })
  it('startup validates secrets and public booleans at runtime, not just during build', async () => {
    vi.resetModules()
    const {validateStartupConfig, normalizePublicRuntimeConfig} = await import('../../server/utils/startup-config')
    vi.stubGlobal('useRuntimeConfig', () => ({...config, session: {password: 'short'}}))
    expect(validateStartupConfig).toThrow('32+')
    vi.stubGlobal('useRuntimeConfig', () => config)
    vi.stubEnv('NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY', 'invalid-secret')
    expect(validateStartupConfig).toThrow('supported boolean')
    vi.stubEnv('NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY', 'off')
    expect(validateStartupConfig).not.toThrow()
    const eventConfig = {public: {footerShowPoweredBy: true}}
    normalizePublicRuntimeConfig(eventConfig)
    expect(eventConfig).toEqual({public: {footerShowPoweredBy: false}})
  })
})
