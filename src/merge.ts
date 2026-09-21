import type { LocaleMessages, Messages, TranslationFile } from './types'

export function isPlainObject(v: unknown): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T
  if (isPlainObject(v)) {
    const out: Record<string, any> = {}
    for (const k of Object.keys(v)) out[k] = clone(v[k])
    return out as T
  }
  return v
}

/**
 * Recursively merge `source` into `target` (mutates and returns `target`).
 * Nested plain objects merge; anything else (strings, arrays, null) is
 * overwritten by the source value. Same semantics as learn-atc's messageloader.
 */
export function deepMerge(target: Messages, source: Messages): Messages {
  for (const key of Object.keys(source)) {
    if (isPlainObject(source[key]) && isPlainObject(target[key])) {
      target[key] = deepMerge(target[key], source[key])
    } else {
      target[key] = clone(source[key])
    }
  }
  return target
}

/**
 * Build `{ [locale]: messages }`: seed every locale from `locales`, then
 * deep-merge each page module's `[locale]` slice in the order given (last
 * wins). The set of locales is exactly `Object.keys(locales)` — a locale that
 * appears only in a page is ignored. Inputs are not mutated.
 *
 * Feed it `import.meta.glob` results (sorted by path for a stable order) and
 * hand the result to vue-i18n as `messages`.
 */
export function mergeMessages(locales: Record<string, Messages>, pages: TranslationFile[]): LocaleMessages {
  const payload: LocaleMessages = {}
  for (const lang of Object.keys(locales)) {
    payload[lang] = clone(locales[lang] ?? {})
  }
  for (const page of pages) {
    if (!isPlainObject(page)) continue
    for (const lang of Object.keys(payload)) {
      const slice = page[lang]
      if (isPlainObject(slice)) deepMerge(payload[lang], slice)
    }
  }
  return payload
}
