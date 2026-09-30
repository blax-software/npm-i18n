// Node-only half: reads an `i18n/` source tree from disk, transpiles the
// pure-data `.ts` modules with esbuild (no bundler needed), and feeds the
// framework-agnostic core. The CLI is a thin wrapper over these functions.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { checkTranslations, walkKeys, type CheckReport, type CheckSource } from './check'
import { isPlainObject, mergeMessages } from './merge'
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

/**
 * The package.json field an npm package sets to register its translations: a
 * path, relative to that package.json, to a module whose default export has the
 * page-module shape (`{ en: {...}, de: {...} }`).
 *
 * @example
 * // node_modules/@blax-software/networking/package.json
 * { "name": "@blax-software/networking", "blax-i18n": "./dist/i18n.js" }
 */
export const PACKAGE_FIELD = 'blax-i18n'

/** Translations one npm package registered through {@link PACKAGE_FIELD}. */
export interface PackageSource {
  /** Package name, e.g. `@blax-software/networking`. */
  name: string
  /** Label used in reports: `package:<name>`. */
  file: string
  data: TranslationFile
}

export interface SourceTree {
  /** Locale code → base messages from `<src>/locales/<code>.*` (missing file → `{}`). */
  locales: Record<string, Messages>
  /** Page modules in sorted path order, as `{ file, data }`. */
  pages: { file: string; data: TranslationFile }[]
  /** Locale codes that have a base file under `<src>/locales/`. */
  baseLocales: string[]
  /** Package translations in merge order (empty unless `packages` was given). */
  packages: PackageSource[]
}

export interface ReadOptions {
  /** Directory holding `locales/` and `pages/` (default `i18n`). */
  src?: string
  /** Locales to load; defaults to every base file under `<src>/locales/`. */
  locales?: string[]
  /**
   * npm packages whose translations merge under the app's own. `'auto'` takes
   * every dependency in the app's package.json that declares
   * {@link PACKAGE_FIELD}; a list names them explicitly (and throws when one is
   * not installed or declares nothing). Omitted: no package translations.
   */
  packages?: 'auto' | string[]
  /** Directory of the app's package.json; defaults to the nearest one above `src`. */
  root?: string
}

function findRoot(start: string): string {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

function findPackageDir(root: string, name: string): string | null {
  let dir = root
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const readJson = (file: string): Record<string, any> => JSON.parse(readFileSync(file, 'utf8'))

/** Load the translations the given (or auto-discovered) npm packages register. */
export function readPackageSources(options: ReadOptions = {}): PackageSource[] {
  const wanted = options.packages
  if (!wanted || (Array.isArray(wanted) && !wanted.length)) return []
  const root = resolve(options.root ?? findRoot(resolve(options.src ?? 'i18n')))
  const auto = wanted === 'auto'

  let names: string[]
  if (auto) {
    const manifest = existsSync(join(root, 'package.json')) ? readJson(join(root, 'package.json')) : {}
    names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort()
  } else {
    names = wanted
  }

  const sources: PackageSource[] = []
  for (const name of names) {
    const dir = findPackageDir(root, name)
    if (!dir) {
      if (auto) continue
      throw new Error(`${OWN_PACKAGE}: package "${name}" is not installed (looked in node_modules above ${root})`)
    }
    const entry = readJson(join(dir, 'package.json'))[PACKAGE_FIELD]
    if (typeof entry !== 'string') {
      if (auto) continue
      throw new Error(`${OWN_PACKAGE}: package "${name}" does not declare "${PACKAGE_FIELD}" in its package.json`)
    }
    const file = resolveSource(resolve(dir, entry))
    if (!file) throw new Error(`${OWN_PACKAGE}: "${name}" declares ${PACKAGE_FIELD}: "${entry}", but that file does not exist`)
    sources.push({ name, file: `package:${name}`, data: defaultExport(loadModule(file)) as TranslationFile })
  }
  return sources
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

  return { locales, pages, baseLocales, packages: readPackageSources(options) }
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
  const def = options.defaultLocale
  // Without `locales`, every base file is emitted, and `defaultLocale` is added
  // to that set rather than replacing it.
  const wanted = options.locales?.length ? [...new Set([...options.locales, ...(def ? [def] : [])])] : undefined
  const tree = readSourceTree({ ...options, locales: wanted })
  if (def && !(def in tree.locales)) tree.locales[def] = {}
  return mergeTree(tree)
}

function mergeTree(tree: SourceTree): LocaleMessages {
  return mergeMessages(tree.locales, tree.pages.map((p) => p.data), { packages: tree.packages.map((p) => p.data) })
}

/** The part of `tree` whose dotted leaf path is in `keys`. */
function pickKeys(tree: Messages, keys: Set<string>): Messages {
  const out: Messages = {}
  for (const [path, value] of walkKeys(tree)) {
    if (!keys.has(path)) continue
    const parts = path.split('.')
    let node = out
    for (const part of parts.slice(0, -1)) node = node[part] ??= {}
    node[parts[parts.length - 1]] = value
  }
  return out
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

/**
 * Read the tree and run `checkTranslations` over the base files and every page.
 *
 * Package translations are checked against the MERGED messages: a package key
 * counts as present in a locale when the package ships it or the app supplies
 * it (base file or page), so an app can fill a locale a package does not ship.
 */
export function checkSourceTree(options: CheckSourceOptions = {}): CheckReport {
  const tree = readSourceTree(options)
  const locales = options.locales?.length ? options.locales : tree.baseLocales
  const sources: CheckSource[] = [
    { file: 'locales/*', data: tree.locales },
    ...tree.pages,
  ]
  if (!tree.packages.length) return checkTranslations(sources, { locales, reference: options.reference })

  const merged = mergeTree(tree)
  // locale → keys some package ships for it. An app page that overrides a
  // package string in one locale is not "missing" it in the others.
  const shipped: Record<string, Set<string>> = {}
  for (const locale of locales) shipped[locale] = new Set()
  for (const pkg of tree.packages) {
    const keys = new Set<string>()
    for (const [locale, slice] of Object.entries(pkg.data ?? {})) {
      if (!isPlainObject(slice)) continue
      for (const key of walkKeys(slice).keys()) {
        keys.add(key)
        shipped[locale]?.add(key)
      }
    }
    const data: TranslationFile = {}
    for (const locale of locales) data[locale] = pickKeys(merged[locale] ?? {}, keys)
    sources.push({ file: pkg.file, data })
  }

  const report = checkTranslations(sources, { locales, reference: options.reference })
  let problems = 0
  for (const locale of locales) {
    const r = report.locales[locale]
    r.missing = r.missing.filter((p) => p.file.startsWith('package:') || !shipped[locale].has(p.key))
    problems += r.missing.length + r.markers.length
  }
  return { ...report, ok: problems === 0, problems }
}
