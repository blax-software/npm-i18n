import { describe, expect, it } from 'vitest'
import { deepMerge, mergeMessages, type TranslationFile } from '../src'

describe('mergeMessages', () => {
  it('seeds from locales and deep-merges pages in order, last wins', () => {
    const locales = {
      en: { common: { save: 'Save', cancel: 'Cancel' } },
      de: { common: { save: 'Speichern', cancel: 'Abbrechen' } },
    }
    const pages = [
      { en: { cart: { title: 'Cart' }, common: { save: 'Save changes' } }, de: { cart: { title: 'Warenkorb' } } },
      { en: { cart: { empty: 'Empty' } }, de: { cart: { empty: 'Leer', title: 'Korb' } } },
    ]
    expect(mergeMessages(locales, pages)).toEqual({
      en: { common: { save: 'Save changes', cancel: 'Cancel' }, cart: { title: 'Cart', empty: 'Empty' } },
      de: { common: { save: 'Speichern', cancel: 'Abbrechen' }, cart: { title: 'Korb', empty: 'Leer' } },
    })
  })

  it('ignores locales that only appear in pages', () => {
    const out = mergeMessages({ en: {} }, [{ en: { a: '1' }, pl: { a: '2' } }])
    expect(Object.keys(out)).toEqual(['en'])
  })

  it('tolerates pages without a slice for a locale and non-object slices', () => {
    const out = mergeMessages({ en: { a: '1' }, de: { a: '2' } }, [{ en: { b: '3' } }, { de: 'nope' } as any, null as any])
    expect(out).toEqual({ en: { a: '1', b: '3' }, de: { a: '2' } })
  })

  it('does not mutate its inputs', () => {
    const locales = { en: { common: { save: 'Save' } } }
    const pages = [{ en: { common: { cancel: 'Cancel' }, list: ['x'] } }]
    const out = mergeMessages(locales, pages)
    out.en.common.save = 'changed'
    out.en.list.push('y')
    expect(locales.en.common.save).toBe('Save')
    expect(pages[0].en.list).toEqual(['x'])
  })

  it('matches the learn-atc messageloader output byte for byte', () => {
    // Reference implementation copied from learn-atc-frontend/i18n/messageloader.ts.
    function refMerge(target: any, source: any) {
      for (const key of Object.keys(source)) {
        if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] !== null && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          target[key] = refMerge(target[key], source[key])
        } else target[key] = source[key]
      }
      return target
    }
    const locales = {
      de: { a: { b: 'x', arr: [1, 2] }, n: null as any },
      en: { a: { b: 'y' }, n: { deep: 1 } },
    }
    const pages: TranslationFile[] = [
      { en: { a: { c: 'z' }, n: 'flat' }, de: { a: { arr: [3] }, n: { now: 'obj' } } },
      { de: { a: { b: { nested: true } } } },
    ]
    const payload: any = {}
    for (const lang of Object.keys(locales)) payload[lang] = { ...structuredClone((locales as any)[lang]) }
    for (const page of pages) for (const lang of Object.keys(payload)) refMerge(payload[lang], (page as any)[lang] ?? {})
    expect(JSON.stringify(mergeMessages(locales, pages))).toBe(JSON.stringify(payload))
  })

  it('merges package translations first, so base files and pages override them', () => {
    const pkg = {
      en: { ws: { lost: 'Connection lost', back: 'Connection restored' } },
      de: { ws: { lost: 'Verbindung unterbrochen', back: 'Verbindung wiederhergestellt' } },
      pl: { ws: { lost: 'Utracono połączenie' } },
    }
    const out = mergeMessages(
      { en: { ws: { back: 'Back online' } }, de: {} },
      [{ de: { ws: { lost: 'Offline' } } }],
      { packages: [pkg] },
    )
    expect(out).toEqual({
      en: { ws: { lost: 'Connection lost', back: 'Back online' } },
      de: { ws: { lost: 'Offline', back: 'Verbindung wiederhergestellt' } },
    })
    expect(pkg.de.ws.lost).toBe('Verbindung unterbrochen')
  })

  it('merges several packages in order, later ones winning', () => {
    const out = mergeMessages({ en: {} }, [], { packages: [{ en: { a: '1', b: '1' } }, { en: { b: '2' } }, null as any] })
    expect(out).toEqual({ en: { a: '1', b: '2' } })
  })

  it('an empty packages list changes nothing', () => {
    const locales = { en: { a: '1' } }
    expect(JSON.stringify(mergeMessages(locales, [], { packages: [] }))).toBe(JSON.stringify(mergeMessages(locales, [])))
  })
})

describe('deepMerge', () => {
  it('overwrites arrays and scalars, merges nested objects', () => {
    const t = { a: { x: 1, arr: [1] }, s: 'a' }
    deepMerge(t, { a: { y: 2, arr: [2, 3] }, s: 'b' })
    expect(t).toEqual({ a: { x: 1, y: 2, arr: [2, 3] }, s: 'b' })
  })
})
