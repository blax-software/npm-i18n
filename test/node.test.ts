import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildMessages, checkSourceTree, readSourceTree, writeMessages } from '../src/node'
import { runCli } from '../src/cli-run'

const SRC = join(__dirname, 'fixtures/i18n')
const tmp: string[] = []
const mkOut = () => {
  const d = mkdtempSync(join(tmpdir(), 'blax-i18n-'))
  tmp.push(d)
  return d
}
afterEach(() => {
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true })
})

function capture() {
  const out: string[] = []
  const err: string[] = []
  return { out, err, io: { log: (l: string) => out.push(l), error: (l: string) => err.push(l) } }
}

describe('readSourceTree', () => {
  it('transpiles .ts sources, resolves package + relative imports', () => {
    const tree = readSourceTree({ src: SRC })
    expect(tree.baseLocales).toEqual(['de', 'en', 'pl'])
    expect(tree.locales.pl.common.cancel).toBe('[missing]')
    expect(tree.pages.map((p) => p.file)).toEqual(['pages/_shared.ts', 'pages/account.ts', 'pages/cart.ts'])
    expect(tree.pages[2].data.en.cart.brand).toBe('Nirioci')
  })

  it('seeds an empty base for a requested locale without a file', () => {
    const tree = readSourceTree({ src: SRC, locales: ['en', 'fr'] })
    expect(tree.locales.fr).toEqual({})
    expect(Object.keys(tree.locales)).toEqual(['en', 'fr'])
  })
})

describe('buildMessages / writeMessages', () => {
  it('merges base + pages per locale', () => {
    const messages = buildMessages({ src: SRC, locales: ['en', 'de', 'pl'] })
    expect(messages.en).toEqual({
      common: { save: 'Save', cancel: 'Cancel', tags: ['one', 'two'] },
      nav: { home: 'Home', cart: 'Cart' },
      account: { title: 'Account', logout: 'Log out' },
      cart: { title: 'Your cart', empty: 'Nothing here yet', brand: 'Nirioci' },
    })
    expect(messages.pl.cart.empty).toBe('[missing]')
    expect(messages.pl.account).toBeUndefined()
  })

  it('always emits the default locale', () => {
    expect(Object.keys(buildMessages({ src: SRC, locales: ['de'], defaultLocale: 'en' }))).toEqual(['de', 'en'])
  })

  it('writes one ESM module per locale', async () => {
    const out = mkOut()
    const written = writeMessages({ src: SRC, out, locales: ['en', 'de'] })
    expect(written.map((w) => w.locale)).toEqual(['en', 'de'])
    const file = join(out, 'de.js')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8').startsWith('export default {')).toBe(true)
    const mod = await import(/* @vite-ignore */ file)
    expect(mod.default.cart.title).toBe('Dein Warenkorb')
  })
})

describe('checkSourceTree', () => {
  it('finds missing keys and markers across base files and pages', () => {
    const report = checkSourceTree({ src: SRC, locales: ['en', 'de', 'pl'] })
    expect(report.ok).toBe(false)
    expect(report.locales.en).toMatchObject({ missing: [], markers: [] })
    expect(report.locales.de.missing).toEqual([{ file: 'pages/account.ts', key: 'account.logout' }])
    expect(report.locales.pl.missing.map((p) => `${p.file}:${p.key}`)).toEqual([
      'pages/account.ts:account.title',
      'pages/account.ts:account.logout',
    ])
    expect(report.locales.pl.markers).toEqual([
      { file: 'locales/*', key: 'common.cancel' },
      { file: 'pages/cart.ts', key: 'cart.empty' },
    ])
  })

  it('passes when only complete locales are checked', () => {
    expect(checkSourceTree({ src: SRC, locales: ['en'] }).ok).toBe(true)
  })
})

describe('runCli', () => {
  it('prints usage and exits 1 without a command', () => {
    const c = capture()
    expect(runCli([], c.io)).toBe(1)
    expect(c.out[0]).toContain('Usage:')
  })

  it('build writes files and reports them', () => {
    const out = mkOut()
    const c = capture()
    expect(runCli(['build', '--src', SRC, '--out', out, '--locales', 'en,de,pl'], c.io)).toBe(0)
    expect(existsSync(join(out, 'pl.js'))).toBe(true)
    expect(c.out.at(-1)).toMatch(/^generated 3 locales in \d+ms$/)
  })

  it('check exits 1 and lists problems, --json emits the report', () => {
    const c = capture()
    expect(runCli(['check', '--src', SRC, '--locales', 'en,de,pl'], c.io)).toBe(1)
    const text = c.out.join('\n')
    expect(text).toContain('de: 1 missing (')
    expect(text).toContain('pl: 2 missing, 2 [missing] (')
    expect(text).toContain('  locales/*  common.cancel  [missing]')

    const j = capture()
    expect(runCli(['check', '--src', SRC, '--locales', 'en,de,pl', '--json'], j.io)).toBe(1)
    const report = JSON.parse(j.out[0])
    expect(report.ok).toBe(false)
    expect(report.problems).toBe(5)
  })

  it('check exits 0 on a complete set', () => {
    const c = capture()
    expect(runCli(['check', '--src', SRC, '--locales', 'en'], c.io)).toBe(0)
    expect(c.out.join('\n')).toContain('i18n check: ok')
  })

  it('rejects unknown flags and commands', () => {
    const c = capture()
    expect(runCli(['check', '--nope'], c.io)).toBe(1)
    expect(runCli(['frobnicate'], c.io)).toBe(1)
    expect(c.err.join('\n')).toContain('unknown command: frobnicate')
  })
})
