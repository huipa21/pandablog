const BOT_USER_AGENT_PATTERN = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|duckduckbot|baiduspider|yandex|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|uptimerobot|pingdom|headlesschrome|lighthouse/i

export function isAnalyticsBot(userAgent: string) {
  return !userAgent || BOT_USER_AGENT_PATTERN.test(userAgent)
}
