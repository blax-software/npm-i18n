import { isPlainObject } from './merge'
import { TranslationMissing, type Messages, type TranslationFile } from './types'

/** One translation source to check: a page module or the collected base files. */
export interface CheckSource {
  /** Label used in reports, e.g. `pages/cart.ts` or `locales/*`. */
  file: string
  data: TranslationFile
}

export interface CheckOptions {
  /** Locales that must be complete. */
  locales: string[]
  /**
   * Reference locale. When set, keys are compared against this locale's key
   * set and keys present elsewhere but absent here are reported as `extra`
   * (informational). When omitted, the reference is the union of all locales'
   * keys and nothing is "extra".
   */
  reference?: string
}

export interface CheckProblem {
  file: string
  key: string
}

export interface LocaleReport {
  locale: string
  /** Keys present in the reference set but absent in this locale. */
  missing: CheckProblem[]
  /** Keys whose value still holds the `[missing]` marker. */
  markers: CheckProblem[]
  /** Keys present here but not in the reference locale (only with `reference`). */
  extra: CheckProblem[]
  /** Number of leaf keys this locale defines across all sources. */
  keys: number
}

export interface CheckReport {
  /** True when no locale has missing keys or markers. */
  ok: boolean
  locales: Record<string, LocaleReport>
  /** missing + markers over all locales. */
  problems: number
}

/** Flatten a message tree into `dotted.key → leaf value`. */
export function walkKeys(tree: Messages, prefix = '', acc = new Map<string, unknown>()): Map<string, unknown> {
  for (const key of Object.keys(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    const value = tree[key]
    if (isPlainObject(value)) walkKeys(value, path, acc)
    else acc.set(path, value)
  }
  return acc
}

function holdsMarker(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(TranslationMissing)
  if (Array.isArray(value)) return value.some(holdsMarker)
  return false
}

/**
 * Compare every source across the given locales. Pure: takes already-loaded
 * data, so it runs in tests and in the CLI alike.
 */
export function checkTranslations(sources: CheckSource[], options: CheckOptions): CheckReport {
  const { locales, reference } = options
  const reports: Record<string, LocaleReport> = {}
  for (const locale of locales) {
    reports[locale] = { locale, missing: [], markers: [], extra: [], keys: 0 }
  }

  for (const source of sources) {
    const flat: Record<string, Map<string, unknown>> = {}
    for (const locale of locales) {
      const slice = source.data?.[locale]
      flat[locale] = isPlainObject(slice) ? walkKeys(slice) : new Map()
      reports[locale].keys += flat[locale].size
    }

    let referenceKeys: Set<string>
    if (reference) {
      referenceKeys = new Set(flat[reference]?.keys() ?? [])
    } else {
      referenceKeys = new Set<string>()
      for (const locale of locales) for (const key of flat[locale].keys()) referenceKeys.add(key)
    }

    for (const locale of locales) {
      const own = flat[locale]
      for (const key of referenceKeys) {
        if (!own.has(key)) reports[locale].missing.push({ file: source.file, key })
        else if (holdsMarker(own.get(key))) reports[locale].markers.push({ file: source.file, key })
      }
      if (reference && locale !== reference) {
        for (const key of own.keys()) {
          if (!referenceKeys.has(key)) reports[locale].extra.push({ file: source.file, key })
        }
      }
    }
  }

  let problems = 0
  for (const locale of locales) problems += reports[locale].missing.length + reports[locale].markers.length

  return { ok: problems === 0, locales: reports, problems }
}

/** Human-readable rendering of a report, one block per locale. */
export function formatReport(report: CheckReport): string {
  const lines: string[] = []
  for (const r of Object.values(report.locales)) {
    const parts: string[] = []
    if (r.missing.length) parts.push(`${r.missing.length} missing`)
    if (r.markers.length) parts.push(`${r.markers.length} ${TranslationMissing}`)
    if (r.extra.length) parts.push(`${r.extra.length} extra`)
    lines.push(`${r.locale}: ${parts.length ? parts.join(', ') : 'ok'} (${r.keys} keys)`)
    for (const p of r.missing) lines.push(`  ${p.file}  ${p.key}  missing`)
    for (const p of r.markers) lines.push(`  ${p.file}  ${p.key}  ${TranslationMissing}`)
    for (const p of r.extra) lines.push(`  ${p.file}  ${p.key}  extra`)
  }
  lines.push(report.ok ? 'i18n check: ok' : `i18n check: ${report.problems} problem${report.problems === 1 ? '' : 's'}`)
  return lines.join('\n')
}
