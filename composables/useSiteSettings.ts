import type { JsonContent } from '~/types/content'

export interface SiteSettingsLink {
  label: string
  url: string
  icon?: string
}

export interface SiteSettings {
  site_title: string
  site_subtitle: string
  site_logo: string
  site_banner: string
  site_banner_position_x: number
  site_banner_position_y: number
  site_banner_zoom: number
  site_hero_height_vh: number
  site_favicon: string
  owner_name: string
  owner_avatar: string
  owner_motto: string
  owner_bio: JsonContent | null
  footer_copyright: string
  footer_links: SiteSettingsLink[]
  footer_social: SiteSettingsLink[]
}

export function useSiteSettings() {
  const fallback = computed<SiteSettings>(() => {
    const siteTitle = 'PandaBlog'

    return {
      site_title: siteTitle,
      site_subtitle: '',
      site_logo: '',
      site_banner: '/defaults/site-banner.jpg',
      site_banner_position_x: 50,
      site_banner_position_y: 50,
      site_banner_zoom: 100,
      site_hero_height_vh: 34,
      site_favicon: '/favicon.ico',
      owner_name: '',
      owner_avatar: '',
      owner_motto: '',
      owner_bio: null,
      footer_copyright: `© ${new Date().getFullYear()} ${siteTitle}. All rights reserved.`,
      footer_links: [],
      footer_social: []
    }
  })

  const { data, pending, error, refresh } = usePublicBootstrap()

  const settings = computed<SiteSettings>(() => {
    const remote = (data.value?.settings ?? {}) as Partial<SiteSettings>

    return {
      ...fallback.value,
      ...remote,
      site_title: textValue(remote.site_title) || fallback.value.site_title,
      site_subtitle: textValue(remote.site_subtitle) || fallback.value.site_subtitle,
      site_logo: textValue(remote.site_logo) || fallback.value.site_logo,
      site_banner: textValue(remote.site_banner) || fallback.value.site_banner,
      site_banner_position_x: numberValue(remote.site_banner_position_x, fallback.value.site_banner_position_x, 0, 100),
      site_banner_position_y: numberValue(remote.site_banner_position_y, fallback.value.site_banner_position_y, 0, 100),
      site_banner_zoom: numberValue(remote.site_banner_zoom, fallback.value.site_banner_zoom, 100, 200),
      site_hero_height_vh: numberValue(remote.site_hero_height_vh, fallback.value.site_hero_height_vh, 18, 58),
      site_favicon: textValue(remote.site_favicon) || fallback.value.site_favicon,
      owner_name: textValue(remote.owner_name) || fallback.value.owner_name,
      owner_avatar: textValue(remote.owner_avatar) || fallback.value.owner_avatar,
      owner_motto: textValue(remote.owner_motto),
      owner_bio: jsonContentValue(remote.owner_bio),
      footer_copyright: textValue(remote.footer_copyright) || fallback.value.footer_copyright,
      footer_links: linksValue(remote.footer_links),
      footer_social: linksValue(remote.footer_social)
    }
  })

  return {
    settings,
    pending,
    error,
    refresh,
    siteName: computed(() => settings.value.site_title),
    siteSubtitle: computed(() => settings.value.site_subtitle),
    siteLogo: computed(() => settings.value.site_logo),
    siteBanner: computed(() => settings.value.site_banner),
    siteBannerPositionX: computed(() => settings.value.site_banner_position_x),
    siteBannerPositionY: computed(() => settings.value.site_banner_position_y),
    siteBannerZoom: computed(() => settings.value.site_banner_zoom),
    siteHeroHeightVh: computed(() => settings.value.site_hero_height_vh),
    siteFavicon: computed(() => settings.value.site_favicon),
    ownerName: computed(() => settings.value.owner_name),
    ownerAvatar: computed(() => settings.value.owner_avatar),
    ownerMotto: computed(() => settings.value.owner_motto),
    ownerBio: computed(() => settings.value.owner_bio),
    footerCopyright: computed(() => settings.value.footer_copyright),
    footerLinks: computed(() => settings.value.footer_links),
    footerSocial: computed(() => settings.value.footer_social)
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(max, Math.max(min, number))
}

function jsonContentValue(value: unknown): JsonContent | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const node = value as JsonContent
  return typeof node.type === 'string' ? node : null
}

function linksValue(value: unknown): SiteSettingsLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const link = item as Record<string, unknown>
      const label = textValue(link.label)
      const url = textValue(link.url)
      const icon = textValue(link.icon)

      if (!label || !url) {
        return null
      }

      return icon ? { label, url, icon } : { label, url }
    })
    .filter((item): item is SiteSettingsLink => Boolean(item))
}

