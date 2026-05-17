import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const localEnv = readLocalEnv()

function envValue(name: string, fallback = '') {
  return process.env[name] ?? localEnv[name] ?? fallback
}

function localFirstEnvValue(name: string, fallback = '') {
  return localEnv[name] ?? process.env[name] ?? fallback
}

const fallbackSessionPassword = createHash('sha256')
  .update([
    envValue('SURREAL_ROOT_PASSWORD'),
    envValue('APP_LOGIN_PASSWORD') || envValue('PANDABLOG_PASSWORD') || localFirstEnvValue('PASSWORD'),
    'pandablog-session'
  ].join(':'))
  .digest('hex')

export default defineNuxtConfig({
  compatibilityDate: '2026-05-17',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxt/icon',
    '@pinia/nuxt',
    'nuxt-auth-utils'
  ],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    surrealUrl: envValue('SURREAL_URL', 'ws://127.0.0.1:8000/rpc'),
    surrealNamespace: envValue('SURREAL_NAMESPACE', 'main'),
    surrealDatabase: envValue('SURREAL_DATABASE', 'main'),
    surrealRoot: envValue('SURREAL_ROOT', 'root'),
    surrealRootPassword: envValue('SURREAL_ROOT_PASSWORD', 'root'),
    adminUsername: envValue('APP_LOGIN_USERNAME') || envValue('PANDABLOG_USERNAME') || localFirstEnvValue('USERNAME', 'admin'),
    adminPassword: envValue('APP_LOGIN_PASSWORD') || envValue('PANDABLOG_PASSWORD') || localFirstEnvValue('PASSWORD'),
    session: {
      password: envValue('NUXT_SESSION_PASSWORD', fallbackSessionPassword),
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      }
    },
    public: {
      siteName: 'PandaBlog'
    }
  },
  image: {
    provider: 'ipx',
    domains: []
  }
})

function readLocalEnv() {
  const path = '.env'

  if (!existsSync(path)) {
    return {} as Record<string, string>
  }

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        const name = line.slice(0, index).trim()
        const value = line.slice(index + 1).trim().replace(/^"|"$/g, '')
        return [name, value]
      })
      .filter(([name]) => Boolean(name))
  )
}