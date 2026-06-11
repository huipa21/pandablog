import { existsSync, readFileSync } from 'node:fs'
import svgLoader from 'vite-svg-loader'

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
  throw new Error(
    'NUXT_SESSION_PASSWORD must be set to a 32+ character random string in .env'
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
    '@nuxtjs/i18n',
    'nuxt-auth-utils'
  ],
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    langDir: 'locales',
    locales: [
      { code: 'en', name: 'English', language: 'en-US', file: 'en.json' },
      { code: 'zh-CN', name: '简体中文', language: 'zh-CN', file: 'zh-CN.json' }
    ],
    detectBrowserLanguage: {
      useCookie: false,
      alwaysRedirect: false,
      fallbackLocale: 'en'
    }
  },
  css: ['~/assets/css/main.css'],
  icon: {
    provider: 'server',
    serverBundle: {
      collections: ['lucide']
    },
    clientBundle: {
      scan: true
    }
  },
  runtimeConfig: {
    surrealUrl: env('SURREAL_URL', 'ws://127.0.0.1:8000/rpc'),
    surrealNamespace: env('SURREAL_NAMESPACE', 'main'),
    surrealDatabase: env('SURREAL_DATABASE', 'main'),
    surrealRoot: env('SURREAL_ROOT', 'root'),
    surrealRootPassword: env('SURREAL_ROOT_PASSWORD', ''),
    session: {
      password: sessionPassword,
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
  vite: {
    plugins: [
      svgLoader({
        defaultImport: 'component',
        svgo: false
      })
    ]
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