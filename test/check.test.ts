import { describe, expect, it } from 'vitest'
import { checkTranslations, formatReport, TranslationMissing, walkKeys } from '../src'

const cart = {
  file: 'pages/cart.ts',
  data: {
    en: { cart: { title: 'Cart', empty: 'Empty', list: ['a', 'b'] } },
    de: { cart: { title: 'Warenkorb', empty: TranslationMissing, list: ['a', TranslationMissing] } },
    pl: { cart: { title: 'Koszyk' } },
  },
}

describe('walkKeys', () => {
  it('flattens nested objects, keeps arrays as leaves', () => {
    expect([...walkKeys({ a: { b: 'x', c: { d: 'y' } }, e: ['z'] }).keys()]).toEqual(['a.b', 'a.c.d', 'e'])
  })
})

describe('checkTranslations', () => {
  it('reports missing keys against the union and [missing] markers per locale', () => {
    const report = checkTranslations([cart], { locales: ['en', 'de', 'pl'] })
    expect(report.ok).toBe(false)
    expect(report.locales.en.missing).toEqual([])
    expect(report.locales.en.markers).toEqual([])
    expect(report.locales.de.missing).toEqual([])
    expect(report.locales.de.markers.map((p) => p.key)).toEqual(['cart.empty', 'cart.list'])
    expect(report.locales.pl.missing.map((p) => p.key)).toEqual(['cart.empty', 'cart.list'])
    expect(report.problems).toBe(4)
    expect(report.locales.en.keys).toBe(3)
  })

  it('treats a locale absent from a page as missing every key', () => {
    const report = checkTranslations([{ file: 'pages/x.ts', data: { en: { a: '1', b: { c: '2' } } } }], { locales: ['en', 'de'] })
    expect(report.locales.de.missing.map((p) => `${p.file}:${p.key}`)).toEqual(['pages/x.ts:a', 'pages/x.ts:b.c'])
  })

  it('uses the union without a reference, so keys only in de count as missing in en', () => {
    const report = checkTranslations([{ file: 'f', data: { en: { a: '1' }, de: { a: '1', b: '2' } } }], { locales: ['en', 'de'] })
    expect(report.locales.en.missing.map((p) => p.key)).toEqual(['b'])
    expect(report.locales.de.extra).toEqual([])
  })

  it('with a reference locale, lists surplus keys as extra without failing', () => {
    const report = checkTranslations([{ file: 'f', data: { en: { a: '1' }, de: { a: '1', b: '2' } } }], { locales: ['en', 'de'], reference: 'en' })
    expect(report.ok).toBe(true)
    expect(report.locales.en.missing).toEqual([])
    expect(report.locales.de.extra.map((p) => p.key)).toEqual(['b'])
  })

  it('passes a complete tree', () => {
    const report = checkTranslations(
      [{ file: 'locales/*', data: { en: { a: 'x' }, de: { a: 'y' } } }, { file: 'pages/p.ts', data: { en: { p: { q: '1' } }, de: { p: { q: '2' } } } }],
      { locales: ['en', 'de'] },
    )
    expect(report).toMatchObject({ ok: true, problems: 0 })
    expect(formatReport(report)).toBe('en: ok (2 keys)\nde: ok (2 keys)\ni18n check: ok')
  })

  it('formats problems per locale with file and key', () => {
    const text = formatReport(checkTranslations([cart], { locales: ['en', 'pl'] }))
    expect(text).toContain('pl: 2 missing (1 keys)')
    expect(text).toContain('  pages/cart.ts  cart.empty  missing')
    expect(text.endsWith('i18n check: 2 problems')).toBe(true)
  })
})
