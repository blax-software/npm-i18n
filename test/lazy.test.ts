import { describe, expect, it } from 'vitest'
import { createLazyLoaders } from '../src'

describe('createLazyLoaders', () => {
  const { loadLocaleMessages, hasLocaleBundle } = createLazyLoaders({
    de: async () => ({ default: { hi: 'Hallo' } }),
    pl: async () => ({ hi: 'Cześć' }),
  })

  it('unwraps default exports and bare modules', async () => {
    expect(await loadLocaleMessages('de')).toEqual({ hi: 'Hallo' })
    expect(await loadLocaleMessages('pl')).toEqual({ hi: 'Cześć' })
  })

  it('returns null for unknown locales', async () => {
    expect(await loadLocaleMessages('en')).toBeNull()
    expect(await loadLocaleMessages('toString')).toBeNull()
  })

  it('reports registered bundles', () => {
    expect(hasLocaleBundle('de')).toBe(true)
    expect(hasLocaleBundle('en')).toBe(false)
    expect(hasLocaleBundle('constructor')).toBe(false)
  })
})
