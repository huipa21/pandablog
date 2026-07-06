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

function envFlag(name: string, fallback = false): boolean {
  const value = env(name, fallback ? 'true' : 'false').trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes' || value === 'on'
}

const isProd = process.env.NODE_ENV === 'production'
const publicThemeInitScript = `(() => {
  try {
    const serverMode = document.documentElement.dataset.theme
    const storedMode = localStorage.getItem('pb-public-color-mode')
    const mode = serverMode === 'light' || serverMode === 'dark'
      ? serverMode
      : storedMode === 'light' || storedMode === 'dark'
      ? storedMode
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  } catch {}
})()`

const sessionPassword = env('NUXT_SESSION_PASSWORD')
if (!sessionPassword || sessionPassword.length < 32) {
  throw new Error(
    'NUXT_SESSION_PASSWORD must be set to a 32+ character random string in .env'
  )
}

export default defineNuxtConfig({
  compatibilityDate: '2026-05-17',
  devtools: { enabled: !isProd },
  modules: [
    '@nuxt/fonts',
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxt/icon',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    'nuxt-auth-utils'
  ],
  fonts: {
    families: [
      {
        name: 'Lora',
        provider: 'google',
        weights: [400, 600, 700],
        styles: ['normal'],
        global: true
      }
    ]
  },
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
    // Optional least-privilege runtime user. When both are set, normal request
    // queries sign in as this DATABASE-scoped EDITOR user; root creds are then
    // used only at boot (provisioning + schema) and for backups/restore. When
    // unset, the app falls back to signing in as root (back-compatible).
    surrealAppUser: env('SURREAL_APP_USER', ''),
    surrealAppPassword: env('SURREAL_APP_PASSWORD', ''),
    // Optional dedicated key for encrypting stored TOTP/MFA secrets at rest.
    // When unset, the session cookie password is used as the key source.
    // Rotating this value (or the session password fallback) invalidates all
    // stored MFA secrets and requires affected users to re-enroll.
    mfaSecret: env('MFA_SECRET', ''),
    geoipDbPath: env('GEOIP_DB_PATH', 'storage/geoip/dbip-city-lite.mmdb'),
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
      appSponsor: envFlag('APP_SPONSOR'),
      modules: {}
    }
  },
  nitro: {
    compressPublicAssets: {
      brotli: true,
      gzip: true
    },
    storage: {
      'rate-limit': {
        driver: 'fs',
        base: './storage/rate-limit'
      }
    }
  },
  routeRules: {
    '/': { cache: { maxAge: 60, swr: true, staleMaxAge: 120, varies: ['cookie'] } },
    '/_ipx/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/assets/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } }
  },
  build: {
    transpile: ['@unovis/ts', '@unovis/vue']
  },
  vite: {
    optimizeDeps: {
      include: ['highlight.js/lib/languages/latex', 'katex', 'striptags']
    },
    plugins: [
      svgLoader({
        defaultImport: 'component',
        svgo: false
      })
    ]
  },
  app: {
    head: {
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ],
      script: [
        { key: 'pb-public-theme-init', innerHTML: publicThemeInitScript }
      ],
      link: [
        { rel: 'icon', key: 'favicon', type: 'image/x-icon', href: '/favicon.ico' }
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