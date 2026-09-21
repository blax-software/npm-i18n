import type { Messages } from './types'

export type LocaleLoader = () => Promise<any>

export interface LazyLoaders {
  /** One locale's merged messages, or `null` when no loader is registered for it. */
  loadLocaleMessages(locale: string): Promise<Messages | null>
  /** True when a loader is registered for the locale. */
  hasLocaleBundle(locale: string): boolean
}

/**
 * Wrap per-locale dynamic imports of the bundles `blax-i18n build` writes.
 * Keep the `import()` specifiers static so the bundler emits one chunk per
 * locale; leave the eagerly loaded default locale out of the map.
 *
 * @example
 * const { loadLocaleMessages } = createLazyLoaders({
 *   de: () => import('./.messages/de.js'),
 *   pl: () => import('./.messages/pl.js'),
 * })
 */
export function createLazyLoaders(loaders: Record<string, LocaleLoader>): LazyLoaders {
  return {
    async loadLocaleMessages(locale) {
      if (!Object.prototype.hasOwnProperty.call(loaders, locale)) return null
      const load = loaders[locale]
      const mod = await load()
      return (mod?.default ?? mod) as Messages
    },
    hasLocaleBundle(locale) {
      return Object.prototype.hasOwnProperty.call(loaders, locale)
    },
  }
}
