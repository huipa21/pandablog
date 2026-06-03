import { existsSync, readFileSync } from 'node:fs'

const localEnv = readLocalEnv()

/**
 * Resolve env value with .env file as HIGHEST priority.
 * Falls back to process.env, then to the provided default.
 */
function env(name: string, fallback = ''): string {
  return localEnv[name] ?? process.env[name] ?? fallback
}

const isProd = process.env.NODE_ENV === 'production'

const sessionPassword = env('NUXT_SESSION_PASSWORD')
if (!sessionPassword || sessionPassword.length < 32) {
  if (isProd) {
    throw new Error(
      'NUXT_SESSION_PASSWORD must be set to a 32+ character random string in production (.env)'
    )
  }
  console.warn(
    '⚠️  NUXT_SESSION_PASSWORD missing or shorter than 32 chars. ' +
    'Sessions will use a weak insecure value. Set it in .env before going to prod.'
  )
}

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
    surrealUrl: env('SURREAL_URL', 'ws://127.0.0.1:8000/rpc'),
    surrealNamespace: env('SURREAL_NAMESPACE', 'main'),
    surrealDatabase: env('SURREAL_DATABASE', 'main'),
    surrealRoot: env('SURREAL_ROOT', 'root'),
    surrealRootPassword: env('SURREAL_ROOT_PASSWORD', ''),
    session: {
      password: sessionPassword || 'dev-only-insecure-fallback-do-not-use-in-prod-xx',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      cookie: {
        secure: isProd,
        sameSite: 'lax',
        httpOnly: true
      }
    },
    public: {
    }
  },
  nitro: {
    storage: {
      'rate-limit': {
        driver: 'fs',
        base: './.data/rate-limit'
      }
    }
  },
  image: {
    provider: 'ipx',
    domains: []
  },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ]
    }
  },
  devServer: {
    port: 3000
  }
})

/**
 * Read .env file from project root.
 * Returns an empty object if the file doesn't exist.
 */
function readLocalEnv(): Record<string, string> {
  const path = '.env'
  if (!existsSync(path)) return {}

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=')
        if (idx === -1) return ['', '']
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '')
        return [key, value]
      })
      .filter(([key]) => Boolean(key))
  )
}