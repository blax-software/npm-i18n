// Node-only half: reads an `i18n/` source tree from disk, transpiles the
// pure-data `.ts` modules with esbuild (no bundler needed), and feeds the
// framework-agnostic core. The CLI is a thin wrapper over these functions.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { checkTranslations, type CheckReport, type CheckSource } from './check'
import { mergeMessages } from './merge'
import { TranslationMissing, type LocaleMessages, type Messages, type TranslationFile } from './types'

const SOURCE_EXT = /\.(ts|mts|js|mjs|cjs)$/

const OWN_PACKAGE = '@blax-software/i18n'

/**
 * Load a pure-data translation module's `default` export (falling back to the
 * whole exports object) without a bundler. Relative imports are loaded the
 * same way; imports of this package resolve to its runtime constants; any
 * other import yields `{}` — translation files must not depend on app code.
 */
export function loadModule(absPath: string): Record<string, any> {
  const source = readFileSync(absPath, 'utf8')
  const { code } = transformSync(source, { loader: absPath.endsWith('.ts') || absPath.endsWith('.mts') ? 'ts' : 'js', format: 'cjs' })
  const module = { exports: {} as Record<string, any> }
  const requireStub = (spec: string): Record<string, any> => {
    if (spec === OWN_PACKAGE || spec === `${OWN_PACKAGE}/node`) return { TranslationMissing }
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const target = resolveSource(resolve(dirname(absPath), spec))
      if (target) return loadModule(target)
    }
    return {}
  }
  const fn = new Function('module', 'exports', 'require', code)
  fn(module, module.exports, requireStub)
  return module.exports
}

function resolveSource(base: string): string | null {
  const candidates = [base, `${base}.ts`, `${base}.mts`, `${base}.js`, `${base}.mjs`, `${base}.cjs`, join(base, 'index.ts'), join(base, 'index.js')]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

function defaultExport(mod: Record<string, any>): Record<string, any> {
  return mod.default ?? mod
}

function listSources(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => SOURCE_EXT.test(f) && !f.endsWith('.d.ts')).sort()
}

function walkPages(dir: string, rel = ''): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkPages(join(dir, entry.name), relPath))
    else if (SOURCE_EXT.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(relPath)
  }
  return out.sort()
}

export interface SourceTree {
  /** Locale code → base messages from `<src>/locales/<code>.*` (missing file → `{}`). */
  locales: Record<string, Messages>
  /** Page modules in sorted path order, as `{ file, data }`. */
  pages: { file: string; data: TranslationFile }[]
  /** Locale codes that have a base file under `<src>/locales/`. */
  baseLocales: string[]
}

export interface ReadOptions {
  /** Directory holding `locales/` and `pages/` (default `i18n`). */
  src?: string
  /** Locales to load; defaults to every base file under `<src>/locales/`. */
  locales?: string[]
}

/** Read `<src>/locales/*` and `<src>/pages/**` from disk. */
export function readSourceTree(options: ReadOptions = {}): SourceTree {
  const src = resolve(options.src ?? 'i18n')
  const localesDir = join(src, 'locales')
  const pagesDir = join(src, 'pages')

  const baseFiles = listSources(localesDir)
  const baseLocales = baseFiles.map((f) => f.replace(SOURCE_EXT, ''))
  const wanted = options.locales?.length ? options.locales : baseLocales

  const locales: Record<string, Messages> = {}
  for (const locale of wanted) {
    const file = baseFiles.find((f) => f.replace(SOURCE_EXT, '') === locale)
    locales[locale] = file ? { ...defaultExport(loadModule(join(localesDir, file))) } : {}
  }

  const pages = walkPages(pagesDir).map((file) => ({
    file: `pages/${file}`,
    data: defaultExport(loadModule(join(pagesDir, file))) as TranslationFile,
  }))

  return { locales, pages, baseLocales }
}

export interface BuildOptions extends ReadOptions {
  /** Output directory for `<locale>.js` (default `<src>/.messages`). */
  out?: string
  /** Always emitted, even when not in `locales` (default `en`). */
  defaultLocale?: string
}

export interface BuiltLocale {
  locale: string
  file: string
  bytes: number
}

/** Merge the source tree into one message object per locale (nothing written). */
export function buildMessages(options: BuildOptions = {}): LocaleMessages {
  const wanted = new Set(options.locales ?? [])
  if (options.defaultLocale) wanted.add(options.defaultLocale)
  const tree = readSourceTree({ src: options.src, locales: wanted.size ? [...wanted] : undefined })
  return mergeMessages(tree.locales, tree.pages.map((p) => p.data))
}

/** Build and write `<out>/<locale>.js`, one `export default {...}` ESM module per locale. */
export function writeMessages(options: BuildOptions = {}): BuiltLocale[] {
  const src = resolve(options.src ?? 'i18n')
  const out = resolve(options.out ?? join(src, '.messages'))
  const messages = buildMessages(options)
  if (!existsSync(out)) mkdirSync(out, { recursive: true })
  const written: BuiltLocale[] = []
  for (const [locale, data] of Object.entries(messages)) {
    const json = JSON.stringify(data)
    const file = join(out, `${locale}.js`)
    writeFileSync(file, `export default ${json}\n`)
    written.push({ locale, file, bytes: Buffer.byteLength(json) })
  }
  return written
}

export interface CheckSourceOptions extends ReadOptions {
  /** Reference locale; omit to compare against the union of all locales' keys. */
  reference?: string
}

/** Read the tree and run `checkTranslations` over the base files and every page. */
export function checkSourceTree(options: CheckSourceOptions = {}): CheckReport {
  const tree = readSourceTree(options)
  const locales = options.locales?.length ? options.locales : tree.baseLocales
  const sources: CheckSource[] = [
    { file: 'locales/*', data: tree.locales },
    ...tree.pages,
  ]
  return checkTranslations(sources, { locales, reference: options.reference })
}
