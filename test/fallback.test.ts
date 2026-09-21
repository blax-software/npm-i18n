import { describe, expect, it } from 'vitest'
import { fallbackChain } from '../src'

describe('fallbackChain', () => {
  it('maps every non-default locale to the default and sets default', () => {
    expect(fallbackChain(['en', 'de', 'pl'])).toEqual({ de: ['en'], pl: ['en'], default: ['en'] })
  })

  it('honours a custom default locale', () => {
    expect(fallbackChain(['en', 'de'], 'de')).toEqual({ en: ['de'], default: ['de'] })
  })

  it('works with only the default locale', () => {
    expect(fallbackChain(['en'])).toEqual({ default: ['en'] })
  })
})
