export type FallbackChain = Record<string, string[]> & { default: string[] }

/**
 * vue-i18n `fallbackLocale` map: every locale except the default falls back to
 * the default, and `default` is the catch-all for locales not listed.
 *
 * @example fallbackChain(['en', 'de', 'pl']) // { de: ['en'], pl: ['en'], default: ['en'] }
 */
export function fallbackChain(locales: string[], defaultLocale = 'en'): FallbackChain {
  const chain: Record<string, string[]> = {}
  for (const locale of locales) {
    if (locale === defaultLocale) continue
    chain[locale] = [defaultLocale]
  }
  return { ...chain, default: [defaultLocale] } as FallbackChain
}
